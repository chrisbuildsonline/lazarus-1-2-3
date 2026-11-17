// Toasts (requirement 56): info is a status, an error is an alert that waits for Dismiss.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Toasts } from "../../../../src/ui/components/Toast.tsx";

describe("Toasts", () => {
  it("info is role=status with its text and no Dismiss button", () => {
    const html = renderToStaticMarkup(<Toasts toasts={[{ id: 1, kind: "info", text: "Download started: KSBASE.xlsx" }]} onDismiss={() => {}} />);
    expect(html).toMatch(/<div[^>]*role="status"[^>]*>[\s\S]*Download started: KSBASE.xlsx/);
    expect(html).not.toContain("Dismiss");
    expect(html).not.toContain('role="alert"');
  });

  it("error is role=alert with a Dismiss button", () => {
    const html = renderToStaticMarkup(<Toasts toasts={[{ id: 2, kind: "error", text: "The workbook could not be built." }]} onDismiss={() => {}} />);
    expect(html).toMatch(/<div[^>]*role="alert"[^>]*>[\s\S]*The workbook could not be built\./);
    expect(html).toMatch(/<button[^>]*>Dismiss<\/button>/);
  });

  it("sits in a region labelled Notifications, even when empty", () => {
    const html = renderToStaticMarkup(<Toasts toasts={[]} onDismiss={() => {}} />);
    expect(html).toMatch(/role="region"[^>]*aria-label="Notifications"|aria-label="Notifications"[^>]*role="region"/);
  });
});
