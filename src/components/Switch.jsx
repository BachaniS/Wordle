export function Switch({ checked, onChange, disabled, children }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span />
      {children}
    </label>
  );
}
