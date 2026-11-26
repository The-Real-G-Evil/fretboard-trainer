/** Gerätename ohne die laufende Nummer, die Windows beim Wiedereinstecken anhängt:
    „Mikrofon (2- Rocksmith USB Guitar Adapter)“ → „Mikrofon (Rocksmith USB Guitar Adapter)“ (wie im Kern). */
export const deviceLabel = (name: string) => name.replace(/(\()\d+- |^\d+- /g, "$1");
