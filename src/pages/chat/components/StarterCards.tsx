import { useState } from "react";
import { X } from "lucide-react";
import researchImg from "@/assets/svc2-research.png";
import imageImg from "@/assets/svc2-image.png";
import videoImg from "@/assets/svc2-video.png";
import slidesImg from "@/assets/svc2-slides.png";
import webImg from "@/assets/svc2-web.png";
import docsImg from "@/assets/svc2-docs.png";
import integrationsImg from "@/assets/svc-integrations.png";

export interface StarterCardsProps {
  /** Activates the service chip for the picked card. */
  onPick: (prompt: string, mode?: string) => void;
  className?: string;
}

/** Every real service the app offers — no filler. */
const CARDS = [
  {
    id: "image",
    mode: "images",
    img: imageImg,
    title: "Generate images",
    desc: "Photoreal images and edits",
  },
  {
    id: "web",
    mode: "code",
    img: webImg,
    title: "Build a website",
    desc: "Live page with real code",
  },
  {
    id: "video",
    mode: "video",
    img: videoImg,
    title: "Generate video",
    desc: "Cinematic clips from a prompt",
  },
  {
    id: "slides",
    mode: "slides",
    img: slidesImg,
    title: "Presentation",
    desc: "Designed slides with charts",
  },
  {
    id: "research",
    mode: "deep-research",
    img: researchImg,
    title: "Deep research",
    desc: "Sourced, referenced report",
  },
  {
    id: "docs",
    mode: "docs",
    img: docsImg,
    title: "Analyze documents",
    desc: "Tables and answers from files",
  },
  {
    id: "integrations",
    img: integrationsImg,
    title: "Integrations",
    desc: "Connect and use your apps",
  },
];

export function StarterCards({ onPick, className = "" }: StarterCardsProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="text-[13px] font-medium text-foreground/70">Get started</span>
        <button
          type="button"
          aria-label="Hide suggestions"
          onClick={() => setDismissed(true)}
          className="p-1 rounded-full text-foreground/45 hover:text-foreground/80 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-2.5 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden snap-x">
        {CARDS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              if (c.id === "integrations") {
                window.dispatchEvent(new CustomEvent("megsy:open-integrations"));
                return;
              }
              onPick("", (c as { mode?: string }).mode);
            }}
            className="snap-start shrink-0 w-[84%] max-w-[330px] flex items-center gap-3 rounded-[16px] border-0 bg-[color:var(--chat-claude-composer,#262627)] hover:brightness-110 active:scale-[0.99] transition-all px-3.5 py-2 text-start"
          >
            <img
              src={c.img}
              alt=""
              loading="lazy"
              decoding="async"
              width={512}
              height={512}
              className="w-[46px] h-[46px] object-contain shrink-0"
            />
            <span className="min-w-0 flex flex-col gap-0.5">
              <span className="text-[15px] font-bold leading-tight text-foreground truncate">
                {c.title}
              </span>
              <span className="text-[11.5px] leading-snug text-foreground/45 truncate">
                {c.desc}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default StarterCards;
