type Props = {
  eyebrow: string;
  title?: string;
};

export default function SectionHeader({ eyebrow, title }: Props) {
  return (
    <header className="mb-8">
      <div className="mb-3 flex items-center gap-3">
        <span className="h-0.5 w-16 bg-[#c0392b]" aria-hidden="true" />
        <span className="font-mono text-sm font-bold uppercase tracking-[0.3em] text-[#c0392b]">
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
