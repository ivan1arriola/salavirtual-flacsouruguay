import { CheckCircle2, Circle, KeyRound } from "lucide-react";
import { WorkspaceCredentialForm } from "./workspace-credential-form";
import { WorkspaceDelegationForm } from "./workspace-delegation-form";
import { WorkspaceDriveForm } from "./workspace-drive-form";
import { WorkspaceScopesValidator } from "./workspace-scopes-validator";
import { WorkspaceCohostResync } from "./workspace-cohost-resync";
import { WorkspaceStatusForm } from "./workspace-status-form";
import { WorkspaceLegacyCredentials } from "./workspace-legacy-credentials";

export type WorkspaceConfigVisible = Readonly<{
  serviceAccountEmail: string | null;
  serviceAccountSubject: string | null;
  driveDestinationId: string | null;
  privateKeyConfigurada: boolean;
  activa: boolean;
}>;

export function WorkspaceConfigForm({ initial }: Readonly<{ initial: WorkspaceConfigVisible | null }>) {
  const checks = [
    ["Cuenta de servicio", Boolean(initial?.serviceAccountEmail && initial?.privateKeyConfigurada)],
    ["Delegación", Boolean(initial?.serviceAccountSubject)],
    ["Destino Drive", Boolean(initial?.driveDestinationId)],
    ["Integración", Boolean(initial?.activa)],
  ] as const;

  return (
    <>
      <section className="workspace-overview settings-wide" aria-label="Resumen de Google Workspace">
        <div className="workspace-overview-heading">
          <KeyRound size={21} aria-hidden="true" />
          <div><strong>Google Workspace</strong><span>Configuración e integración institucional</span></div>
        </div>
        <div className="workspace-overview-statuses">
          {checks.map(([label, ready]) => (
            <span className={ready ? "is-ready" : "is-pending"} key={label}>
              {ready ? <CheckCircle2 size={15} /> : <Circle size={15} />}{label}
            </span>
          ))}
        </div>
      </section>

      <WorkspaceCredentialForm
        credentialId="principal"
        email={initial?.serviceAccountEmail ?? ""}
        privateKeyConfigured={initial?.privateKeyConfigurada ?? false}
        title="Cuenta de servicio principal"
        description="Es la única credencial autorizada para crear reuniones nuevas."
      />
      <WorkspaceLegacyCredentials />
      <WorkspaceDelegationForm subject={initial?.serviceAccountSubject ?? ""} />
      <WorkspaceScopesValidator />
      <WorkspaceDriveForm folderId={initial?.driveDestinationId ?? ""} />
      <WorkspaceCohostResync />
      <WorkspaceStatusForm active={initial?.activa ?? true} />
    </>
  );
}
