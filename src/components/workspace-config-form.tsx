import { WorkspaceCredentialForm } from "./workspace-credential-form";
import { WorkspaceDelegationForm } from "./workspace-delegation-form";
import { WorkspaceDriveForm } from "./workspace-drive-form";
import { WorkspaceScopesValidator } from "./workspace-scopes-validator";
import { WorkspaceStatusForm } from "./workspace-status-form";

export type WorkspaceConfigVisible = Readonly<{
  serviceAccountEmail: string | null;
  serviceAccountSubject: string | null;
  driveDestinationId: string | null;
  privateKeyConfigurada: boolean;
  activa: boolean;
}>;

export function WorkspaceConfigForm({
  initial
}: Readonly<{ initial: WorkspaceConfigVisible | null }>) {
  return (
    <>
      <WorkspaceCredentialForm
        email={initial?.serviceAccountEmail ?? ""}
        privateKeyConfigured={initial?.privateKeyConfigurada ?? false}
      />
      <WorkspaceDelegationForm subject={initial?.serviceAccountSubject ?? ""} />
      <WorkspaceScopesValidator />
      <WorkspaceDriveForm folderId={initial?.driveDestinationId ?? ""} />
      <WorkspaceStatusForm active={initial?.activa ?? true} />
    </>
  );
}
