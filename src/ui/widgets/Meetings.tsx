export type Meeting = {
  time: string;
  title: string;
  status?: string;
  organizer?: string;
};

export function MeetingsWidget({ meetings, date }: { meetings: Meeting[]; date?: string }) {
  const statusColors: Record<string, string> = {
    accepted: "bg-green-400",
    tentative: "bg-yellow-400",
    declined: "bg-red-400",
    organized: "bg-blue-400",
  };

  return (
    <div className="my-3 max-w-md rounded-xl border border-gray-200 bg-white/90 shadow-sm overflow-hidden">
      {date && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-700">
          📅 {date}
        </div>
      )}
      <div className="divide-y divide-gray-100">
        {meetings.map((m, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
            <div className="flex-shrink-0 mt-1">
              <div className={`w-2.5 h-2.5 rounded-full ${statusColors[m.status?.toLowerCase() ?? ""] ?? "bg-gray-300"}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-800 truncate">{m.title}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-mono text-gray-500">{m.time}</span>
                {m.organizer && <span className="text-xs text-gray-400">• {m.organizer}</span>}
                {m.status && <span className="text-xs text-gray-400 italic">({m.status})</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
