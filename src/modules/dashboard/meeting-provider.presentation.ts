export type MeetingProviderPresentation = Readonly<{
  name: string;
  joinLabel: string;
  pendingLinkLabel: string;
  supportsCohosts: boolean;
}>;

export function getMeetingProviderPresentation(
  providerType: string | null,
): MeetingProviderPresentation {
  if (providerType === "ZOOM") {
    return {
      name: "Zoom",
      joinLabel: "Entrar a Zoom",
      pendingLinkLabel: "Enlace de Zoom pendiente",
      supportsCohosts: false,
    };
  }

  if (providerType === "GOOGLE_MEET") {
    return {
      name: "Google Meet",
      joinLabel: "Entrar a Google Meet",
      pendingLinkLabel: "Enlace de Google Meet pendiente",
      supportsCohosts: true,
    };
  }

  return {
    name: "videollamada",
    joinLabel: "Entrar a la videollamada",
    pendingLinkLabel: "Enlace de la videollamada pendiente",
    supportsCohosts: false,
  };
}
