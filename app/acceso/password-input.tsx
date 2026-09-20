"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function PasswordInput() {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Ocultar contraseña" : "Mostrar contraseña";

  return (
    <div className="login-password-input">
      <input
        id="password"
        name="password"
        type={visible ? "text" : "password"}
        autoComplete="current-password"
        placeholder="••••••••"
        required
      />

      <button
        aria-label={label}
        aria-pressed={visible}
        className="login-password-toggle"
        onClick={() => setVisible((current) => !current)}
        title={label}
        type="button"
      >
        {visible ? <EyeOff aria-hidden="true" size={19} /> : <Eye aria-hidden="true" size={19} />}
      </button>
    </div>
  );
}
