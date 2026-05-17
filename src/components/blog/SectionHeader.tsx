type Props = {
  eyebrow: string;
  title?: string;
};

export default function SectionHeader({ eyebrow, title }: Props) {
  return (
    <header className="mb-8">
      <div className="mb-3 flex items-center gap-3">
        <span className="h-px w-16 bg-[#c0392b]" aria-hidden="true" />
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-[#c0392b]">
          {eyebrow}
        </span>
      </div>
      {title && (
        <h2 className="text-2xl font-bold uppercase tracking-tight text-white sm:text-3xl md:text-4xl">
          {title}
        </h2>
      )}
    </header>
  );
}
