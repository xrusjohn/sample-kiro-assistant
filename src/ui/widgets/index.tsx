import type { ComponentType } from "react";
import { ClockWidget } from "./Clock";
import { CountdownWidget } from "./Countdown";
import { ProgressWidget } from "./Progress";
import { MeetingsWidget } from "./Meetings";
import { HtmlWidget } from "./Html";

// Registry: widget name → component
const widgets: Record<string, ComponentType<any>> = {
  clock: ClockWidget,
  countdown: CountdownWidget,
  progress: ProgressWidget,
  meetings: MeetingsWidget,
  html: HtmlWidget,
};

export function renderWidget(name: string, propsJson: string): JSX.Element | null {
  const Widget = widgets[name];
  if (!Widget) return null;
  try {
    // HTML widget takes raw content, not JSON
    if (name === "html") return <Widget html={propsJson} />;
    const props = propsJson.trim() ? JSON.parse(propsJson) : {};
    return <Widget {...props} />;
  } catch {
    return <div className="text-error text-sm">Widget error: invalid props for {name}</div>;
  }
}

export function isWidgetLanguage(className?: string): { name: string } | null {
  if (!className) return null;
  const match = /language-widget:(\w+)/.exec(className);
  return match ? { name: match[1] } : null;
}
