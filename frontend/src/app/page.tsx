import Link from "next/link";

interface Tool {
  name: string;
  description: string;
  href: string;
  available: boolean;
  icon: React.ReactNode;
}

const tools: Tool[] = [
  {
    name: "RFQ Report Generator",
    description:
      "Generate weekly Open RFQ reports by country from your Excel data. Upload, process, and download formatted reports in seconds.",
    href: "/rfq-report",
    available: true,
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path
          d="M6 4h16v3H6zM6 10h12v2H6zM6 15h14v2H6zM6 20h10v2H6z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    name: "Quoted RFQs Viewer",
    description:
      "Upload your RFQ Excel data to view all open RFQs that have received supplier quotes. Filter and browse results instantly.",
    href: "/quoted-rfqs",
    available: true,
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M4 6h20v16H4z" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M4 10h20M10 10v12M18 10v12" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 15l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: "Mexico Bar Stock Cost Calculator",
    description:
      "Calculate bar stock material costs for Mexico-based manufacturing with up-to-date pricing data.",
    href: "#",
    available: false,
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M14 8v2M14 18v2M11 10.5a3 3 0 0 1 3-1.5c2.2 0 3.5 1.2 3.5 2.5S16.2 14 14 14c-2.2 0-3.5 1.2-3.5 2.5S12.3 19 14 19a3 3 0 0 0 3-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-text-primary mb-2">
          Internal Tools
        </h2>
        <p className="text-text-secondary">
          Select a tool to get started. More tools are being developed and will
          appear here.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {tools.map((tool) => {
          const card = (
            <div
              className={`bg-card border border-border rounded-[10px] p-6 transition-all duration-150 ${
                tool.available
                  ? "hover:border-accent-red hover:bg-card-hover cursor-pointer"
                  : "opacity-50 cursor-not-allowed"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${
                    tool.available
                      ? "bg-accent-red text-white"
                      : "bg-border text-text-muted"
                  }`}
                >
                  {tool.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-base font-semibold text-text-primary">
                      {tool.name}
                    </h3>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        tool.available
                          ? "bg-success/20 text-success"
                          : "bg-border text-text-muted"
                      }`}
                    >
                      {tool.available ? "Available" : "Coming Soon"}
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {tool.description}
                  </p>
                </div>
              </div>
            </div>
          );

          if (tool.available) {
            return (
              <Link key={tool.name} href={tool.href} className="no-underline">
                {card}
              </Link>
            );
          }
          return <div key={tool.name}>{card}</div>;
        })}
      </div>
    </div>
  );
}
