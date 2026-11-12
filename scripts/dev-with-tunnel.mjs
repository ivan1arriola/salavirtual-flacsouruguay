import { spawn } from "node:child_process";
import net from "node:net";

const tunnel = spawn(
  "ssh",
  [
    "-N",
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "ServerAliveInterval=30",
    "-L",
    "15432:127.0.0.1:5432",
    "servidor-flacso"
  ],
  { stdio: "inherit" }
);

let next;
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) {
    return;
  }
  stopping = true;

  tunnel.kill("SIGTERM");
  next?.kill("SIGTERM");

  setTimeout(() => process.exit(exitCode), 2000).unref();
}

function waitForTunnel() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("el puerto local no estuvo disponible a tiempo")),
      10000
    );

    const checkPort = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port: 15432 });
      socket.once("connect", () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (!stopping) {
          setTimeout(checkPort, 100);
        }
      });
    };

    tunnel.once("error", reject);
    tunnel.once("exit", (code, signal) => {
      reject(new Error(`terminó (${signal ?? `código ${code}`}) antes de estar disponible`));
    });
    checkPort();
  });
}

tunnel.once("error", (error) => {
  console.error(`No se pudo iniciar el túnel SSH: ${error.message}`);
  stop(1);
});

tunnel.once("exit", (code, signal) => {
  if (!stopping) {
    console.error(`El túnel SSH terminó inesperadamente (${signal ?? `código ${code}`}).`);
    stop(code ?? 1);
  }
});

waitForTunnel()
  .then(() => {
    if (stopping) {
      return;
    }

    next = spawn("npm", ["run", "dev:next"], {
      stdio: "inherit",
      env: process.env
    });

    next.once("error", (error) => {
      console.error(`No se pudo iniciar Next.js: ${error.message}`);
      stop(1);
    });

    next.once("exit", (code, signal) => {
      if (!stopping) {
        stop(code ?? (signal ? 1 : 0));
      }
    });
  })
  .catch((error) => {
    if (!stopping) {
      console.error(`No se pudo iniciar el túnel SSH: ${error.message}`);
      stop(1);
    }
  });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => stop(0));
}
