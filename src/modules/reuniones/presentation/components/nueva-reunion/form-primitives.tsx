export function ChoicePanel({
  title,
  detail,
  name,
  value,
  noLabel,
  noDetail,
  yesLabel,
  yesDetail,
  onChange
}: Readonly<{
  title: string;
  detail: string;
  name: string;
  value: boolean;
  noLabel: string;
  noDetail: string;
  yesLabel: string;
  yesDetail: string;
  onChange: (value: boolean) => void;
}>) {
  return (
    <div className="organization-choice-panel">
      <h3>{title}</h3><p>{detail}</p>
      <div className="organization-segmented">
        <label className={!value ? "is-selected" : ""}><input type="radio" name={name} checked={!value} onChange={() => onChange(false)} /><span><strong>{noLabel}</strong><small>{noDetail}</small></span></label>
        <label className={value ? "is-selected" : ""}><input type="radio" name={name} checked={value} onChange={() => onChange(true)} /><span><strong>{yesLabel}</strong><small>{yesDetail}</small></span></label>
      </div>
    </div>
  );
}


export function FormSection({ id, icon, title, detail, children }: Readonly<{ id: string; icon: React.ReactNode; title: string; detail: string; children: React.ReactNode }>) {
  return <section className="form-section" id={id}><div className="form-section-title"><span aria-hidden="true">{icon}</span><div><h2>{title}</h2><small>{detail}</small></div></div>{children}</section>;
}

export function Field({ label, wide = false, children }: Readonly<{ label: string; wide?: boolean; children: React.ReactNode }>) {
  return <label className={wide ? "field field-wide" : "field"}><span>{label}</span>{children}</label>;
}
