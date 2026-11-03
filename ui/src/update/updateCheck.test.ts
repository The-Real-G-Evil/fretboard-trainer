import { describe, expect, it } from "vitest";
import { compareVersions, RELEASES_PAGE, updateFromReleases } from "./updateCheck";

const release = (tag: string) => [{
  tag_name: tag, draft: false, assets: [
    { name: `FretboardTrainer-${tag.slice(1)}-Setup.exe`, browser_download_url: `${RELEASES_PAGE}/download/${tag}/FretboardTrainer-${tag.slice(1)}-Setup.exe` },
    { name: `FretboardTrainer-${tag.slice(1)}-macos.dmg`, browser_download_url: `${RELEASES_PAGE}/download/${tag}/FretboardTrainer-${tag.slice(1)}-macos.dmg` },
    { name: `FretboardTrainer-${tag.slice(1)}-linux-amd64.deb`, browser_download_url: `${RELEASES_PAGE}/download/${tag}/FretboardTrainer-${tag.slice(1)}-linux-amd64.deb` },
  ],
}];

describe("Update-Prüfung", () => {
  it("vergleicht Versionen", () => {
    expect(compareVersions("00.00.05", "00.00.04")).toBeGreaterThan(0);
    expect(compareVersions("v00.01.00", "00.00.09")).toBeGreaterThan(0);
    expect(compareVersions("00.00.04", "00.00.04")).toBe(0);
    expect(compareVersions("00.00.03", "00.00.04")).toBeLessThan(0);
  });
  it("wählt den Installer des Systems", () => {
    const win = updateFromReleases(release("v00.00.05"), "00.00.04", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/130");
    expect(win).toMatchObject({ latest: "00.00.05", newer: true, file: "FretboardTrainer-00.00.05-Setup.exe" });
    expect(updateFromReleases(release("v00.00.05"), "00.00.04", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")?.file).toMatch(/\.dmg$/);
    expect(updateFromReleases(release("v00.00.05"), "00.00.04", "Mozilla/5.0 (X11; Linux x86_64)")?.file).toMatch(/\.deb$/);
  });
  it("ohne passenden Installer die Release-Seite, gleiche Version ist nicht neuer", () => {
    expect(updateFromReleases(release("v00.00.05"), "00.00.05", "Unbekannt")).toEqual({ latest: "00.00.05", newer: false, url: RELEASES_PAGE });
    expect(updateFromReleases({ message: "rate limit" }, "00.00.05", "Windows")).toBeNull();
  });
});
