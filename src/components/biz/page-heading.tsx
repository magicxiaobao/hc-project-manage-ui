export function PageHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h1 className="type-title">{title}</h1>
      {hint ? <p className="type-meta mt-1">{hint}</p> : null}
    </div>
  );
}
