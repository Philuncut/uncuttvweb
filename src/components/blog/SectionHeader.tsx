type Props = {
  eyebrow: string;
};

export default function SectionHeader({ eyebrow }: Props) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="h-px w-12 bg-[#c0392b]" aria-hidden="true" />
      <span className="font-mono text-xs uppercase tracking-[0.25em] text-[#c0392b]">
        {eyebrow}
      </span>
    </div>
  );
}
