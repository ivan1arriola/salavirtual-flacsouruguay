import { CheckCircle2, ChevronDown, Circle, History, KeyRound, SlidersHorizontal } from "lucide-react";
import { workspaceReadiness } from "@/src/modules/configuracion/settings-navigation.domain";
import { WorkspaceCredentialForm } from "./workspace-credential-form";
import { WorkspaceDelegationForm } from "./workspace-delegation-form";
import { WorkspaceDriveForm } from "./workspace-drive-form";
import { WorkspaceScopesValidator } from "./workspace-scopes-validator";
import { WorkspaceCohostResync } from "./workspace-cohost-resync";
import { WorkspaceCohostsGlobalVerification } from "./workspace-cohosts-global-verification";
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
  const readiness = workspaceReadiness({
    serviceAccountEmail: initial?.serviceAccountEmail ?? null,
    privateKeyConfigurada: initial?.privateKeyConfigurada ?? false,
    serviceAccountSubject: initial?.serviceAccountSubject ?? null,
    driveDestinationId: initial?.driveDestinationId ?? null,
    activa: initial?.activa ?? false
  });

  return (
    <div className="settings-workspace-groups">
      <section className="workspace-overview settings-wide" aria-label="Resumen de Google Workspace">
        <div className="workspace-overview-heading">
          <KeyRound size={21} aria-hidden="true" />
          <div>
            <strong>{readiness.ready ? "Configuración completa" : `${readiness.readyCount} de ${readiness.totalCount} requisitos listos`}</strong>
            <span>Cuenta principal, delegación, Drive e integración</span>
          </div>
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

      <div className="settings-workspace-pair">
        <WorkspaceDelegationForm subject={initial?.serviceAccountSubject ?? ""} />
        <WorkspaceDriveForm folderId={initial?.driveDestinationId ?? ""} />
      </div>

      <WorkspaceScopesValidator />
      <WorkspaceCohostsGlobalVerification />
      <WorkspaceCohostResync />

      <details className="settings-disclosure settings-disclosure--historical">
        <summary>
          <span className="settings-disclosure__icon"><History size={19} /></span>
          <span><strong>Compatibilidad histórica</strong><small>Credenciales que solo administran reuniones anteriores.</small></span>
          <ChevronDown size={18} aria-hidden="true" />
        </summary>
        <div className="settings-disclosure__body"><WorkspaceLegacyCredentials /></div>
      </details>

      <details className="settings-disclosure settings-disclosure--advanced" open={!initial?.activa}>
        <summary>
          <span className="settings-disclosure__icon"><SlidersHorizontal size={19} /></span>
          <span><strong>Configuración avanzada</strong><small>Pausá o reanudá el aprovisionamiento con Google.</small></span>
          <ChevronDown size={18} aria-hidden="true" />
        </summary>
        <div className="settings-disclosure__body"><WorkspaceStatusForm active={initial?.activa ?? true} /></div>
      </details>
    </div>
  );
}
