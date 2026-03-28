import type { ComponentType } from "react";
import { ClockWidget } from "./Clock";
import { CountdownWidget } from "./Countdown";
import { ProgressWidget } from "./Progress";

// Registry: widget name → component
const widgets: Record<string, ComponentType<any>> = {
  clock: ClockWidget,
  countdown: CountdownWidget,
  progress: ProgressWidget,
};

export function renderWidget(name: string, propsJson: string): JSX.Element | null {
  const Widget = widgets[name];
  if (!Widget) return null;
  try {
    const props = propsJson.trim() ? JSON.parse(propsJson) : {};
    return <Widget {...props} />;
  } catch {
    return <div className="text-error text-sm">Widget error: invalid JSON for {name}</div>;
  }
}

export function isWidgetLanguage(className?: string): { name: string } | null {
  if (!className) return null;
  const match = /language-widget:(\w+)/.exec(className);
  return match ? { name: match[1] } : null;
}
