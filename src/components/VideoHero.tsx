export default function Hero() {
  return (
    <section className="flex w-full flex-col items-center bg-[#0a0a0a] px-4 pt-6 pb-4 md:pt-8 md:pb-6">
      <h1 className="text-5xl font-black tracking-widest sm:text-7xl md:text-6xl lg:text-7xl">
        <span className="text-white">UNCUT</span>
        <span className="text-[#c0392b]">TV</span>
      </h1>
      <p className="mt-4 whitespace-nowrap text-[10px] tracking-[0.2em] text-white/70 sm:text-base sm:tracking-[0.3em] md:mt-2">
        UNCUT &middot; UNZENSIERT &middot; UNGEFILTERT
      </p>
    </section>
  );
}
