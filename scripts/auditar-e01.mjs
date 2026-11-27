import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const output = process.argv[2];
if (!output) {
  throw new Error("Indicar el directorio que contiene dependencies.json.");
}

const slash = (path) => path.replaceAll("\\", "/");
const localPath = (path) => slash(isAbsolute(path) ? relative(root, path) : path);
const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const roles = new Set(["ADMINISTRACION", "DOCENTE", "ASISTENTE_TECNICO"]);
const guardPattern =
  /auth|session|actor|permis|puede|require|forbidden|validar|verificar|secret|firma/i;

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function directive(node) {
  if (!ts.isExpressionStatement(node)) {
    return false;
  }
  return ts.isStringLiteral(node.expression) && node.expression.text === "use server";
}

function exported(node) {
  return Boolean(node.modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword));
}

function lineOf(node, source) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function functionName(node) {
  if (node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
    return node.parent.name.text;
  }
  return "(inline)";
}

function bindingNames(name) {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }
  return name.elements.filter(ts.isBindingElement).flatMap((element) => bindingNames(element.name));
}

function exportEntries(statement) {
  if (ts.isFunctionDeclaration(statement) && exported(statement) && statement.name) {
    return [{ name: statement.name.text, node: statement }];
  }
  if (ts.isVariableStatement(statement) && exported(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      bindingNames(declaration.name).map((name) => ({
        name,
        node: declaration.initializer ?? declaration,
      })),
    );
  }
  if (ts.isExportDeclaration(statement)) {
    const clause = statement.exportClause;
    if (clause && ts.isNamedExports(clause)) {
      return clause.elements.map((element) => ({ name: element.name.text, node: element }));
    }
  }
  return [];
}

function clues(node, source) {
  const calls = [];
  const guards = [];
  const roleLiterals = [];
  walk(node, (child) => {
    if (ts.isCallExpression(child)) {
      const expression = child.expression;
      if (ts.isIdentifier(expression)) {
        calls.push({ name: expression.text, line: lineOf(expression, source) });
      }
      if (ts.isPropertyAccessExpression(expression)) {
        calls.push({ name: expression.name.text, line: lineOf(expression.name, source) });
      }
    }
    if (ts.isIdentifier(child) && guardPattern.test(child.text)) {
      guards.push({ name: child.text, line: lineOf(child, source) });
    }
    if (ts.isStringLiteral(child) && roles.has(child.text)) {
      roleLiterals.push({ role: child.text, line: lineOf(child, source) });
    }
  });
  return { calls, guards, roleLiterals };
}

function entry(source, kind, name, node) {
  return {
    file: localPath(source.fileName),
    kind,
    name,
    line: lineOf(node, source),
    ...clues(node, source),
    status: "PENDIENTE_TRAZABILIDAD_Y_PRUEBA",
  };
}

function scanEntries(source) {
  const file = localPath(source.fileName);
  const route = /^app\/api\/.*\/route\.ts$/.test(file);
  const moduleAction = source.statements.some(directive);
  const entries = source.statements.flatMap(exportEntries);
  const selected = entries.filter((item) => (route ? methods.has(item.name) : moduleAction));
  const kind = route ? "http" : "server-export";
  const result = selected.map((item) => entry(source, kind, item.name, item.node));
  const positions = new Set(selected.map((item) => item.node.pos));
  walk(source, (node) => {
    if (!ts.isFunctionLike(node) || !node.body || !ts.isBlock(node.body)) {
      return;
    }
    if (node.body.statements.some(directive) && !positions.has(node.pos)) {
      result.push(entry(source, "server-inline", functionName(node), node));
    }
  });
  return result;
}

function cssImports(source) {
  return source.statements
    .filter(ts.isImportDeclaration)
    .filter(
      (node) =>
        ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.endsWith(".css"),
    )
    .map((node) => ({
      file: localPath(source.fileName),
      line: lineOf(node, source),
      specifier: node.moduleSpecifier.text,
    }));
}

function owner(path) {
  const parts = path.split("/");
  if (parts[0] === "src" && parts[1] === "modules") {
    return "modules/" + parts[2];
  }
  if (parts[0] === "src") {
    return "src/" + parts[1];
  }
  return parts[0];
}

function graphSummary(modules) {
  const groups = new Map();
  const unresolved = [];
  for (const graphNode of modules) {
    const from = localPath(graphNode.source);
    for (const dep of graphNode.dependencies ?? []) {
      if (dep.couldNotResolve) {
        unresolved.push({ from, specifier: dep.module });
      }
      const to = localPath(dep.resolved ?? "");
      if (!/^(src|app)\//.test(to) && to !== "auth.ts") {
        continue;
      }
      const a = owner(from);
      const b = owner(to);
      if (a === b) {
        continue;
      }
      const key = a + " -> " + b;
      const counts = groups.get(key) ?? { from: a, to: b, runtime: 0, typeOnly: 0 };
      const types = dep.dependencyTypes ?? [];
      if (types.includes("type-only") || types.includes("pre-compilation-only")) {
        counts.typeOnly++;
      } else {
        counts.runtime++;
      }
      groups.set(key, counts);
    }
  }
  return {
    edges: [...groups.values()].sort((a, b) => a.runtime - b.runtime).reverse(),
    unresolved,
  };
}

const sources = ts.sys
  .readDirectory(root, [".ts", ".tsx"], ["**/node_modules/**"], ["app/**/*", "src/**/*", "auth.ts"])
  .sort();
const parsed = sources.map((file) =>
  ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true),
);
const entries = parsed.flatMap(scanEntries);
const routeFiles = sources.map(localPath).filter((file) => /^app\/api\/.*\/route\.ts$/.test(file));
const inventoried = new Set(
  entries.filter((item) => item.kind === "http").map((item) => item.file),
);
const unidentifiedRoutes = routeFiles.filter((file) => !inventoried.has(file));
const css = parsed.flatMap(cssImports);
const graph = JSON.parse(readFileSync(join(output, "dependencies.json"), "utf8"));
const { edges, unresolved } = graphSummary(graph.modules);
const pagesWithDb = graph.modules
  .filter((item) => /(^|\/)page\.tsx$/.test(item.source))
  .filter((item) =>
    item.dependencies?.some((dep) => localPath(dep.resolved ?? "") === "src/lib/db.ts"),
  )
  .map((item) => localPath(item.source));
const summary = {
  sourceFiles: sources.length,
  routeFiles: routeFiles.length,
  httpMethods: entries.filter((item) => item.kind === "http").length,
  unidentifiedRoutes,
  serverExports: entries.filter((item) => item.kind === "server-export").length,
  serverInline: entries.filter((item) => item.kind === "server-inline").length,
  cssImports: css.length,
  graphModules: graph.modules.length,
  crossOwnerPairs: edges.length,
  unresolvedImports: unresolved.length,
  pagesWithDb: pagesWithDb.length,
};

function save(name, data) {
  writeFileSync(resolve(output, name), JSON.stringify(data, null, 2) + "\n");
}

save("entries.json", entries);
save("css-imports.json", css);
save("owner-graph.json", { edges, unresolved, pagesWithDb });
save("summary.json", summary);
console.log("E01_SUMMARY " + JSON.stringify(summary));
console.log("E01_TOP_EDGES " + JSON.stringify(edges.slice(0, 20)));
