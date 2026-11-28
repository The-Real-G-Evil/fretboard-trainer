// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { setLang } from "./i18n";
import { renderWithBackend } from "./test/renderWithBackend";

describe("App: Sprachauswahl", () => {
  afterEach(() => setLang("de"));

  it("startet in der gespeicherten Sprache", async () => {
    await renderWithBackend(<App />, { lang: "de" });
    expect(await screen.findByRole("tab", { name: "Üben" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Einstellungen" })).toBeTruthy();
  });

  it("Umschalten auf Englisch übersetzt die Navigation", async () => {
    const user = userEvent.setup();
    await renderWithBackend(<App />, { lang: "de" });
    await screen.findByRole("tab", { name: "Üben" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Sprache" }), "en");

    expect(await screen.findByRole("tab", { name: "Practice" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Courses" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Üben" })).toBeNull();
    expect((screen.getByRole("combobox", { name: "Language" }) as HTMLSelectElement).value).toBe("en");
  });
});
