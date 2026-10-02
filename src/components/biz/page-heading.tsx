export function PageHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <h1 className="type-title break-words">{title}</h1>
      {hint ? <p className="type-meta mt-1 max-w-prose">{hint}</p> : null}
    </div>
  );
}
