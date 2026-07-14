# Abyssal Welcome Bot

Welcome-Bot für **The Abyssal Emperors**. Begrüßt neue Mitglieder episch,
verweist auf den Verify-Channel und erinnert unverifizierte Mitglieder nach
einer konfigurierbaren Zeit automatisch.

## Funktionen

1. **Willkommensnachricht** beim ersten Join in `#welcome` (oder deinem gewählten
   Channel), pingt den User einmalig, mit dunklem Abyssal-Embed
2. **Optionale Auto-Rolle** ("Unverified"/"Guest") direkt beim Join
3. **Verifizierungs-Erinnerung** nach X Minuten (Standard: 10), zuerst per DM
   versucht, bei deaktivierten DMs automatisch als Fallback im Welcome-Channel
4. **Kein Doppel-Pingen**: Jeder User wird nur beim allerersten Join begrüßt,
   auch bei einem späteren Rejoin nicht erneut (wird in `greeted_users.json` gespeichert)
5. **Neustart-sicher**: Offene Erinnerungen werden beim Bot-Neustart aus
   `reminder_status.json` wiederhergestellt statt zu verschwinden

## Einrichtung

### 1. Discord Application

Empfohlen: **eigene, zweite** Discord Application für diesen Bot anlegen
(sauber getrennt vom Verify-Bot, kein Risiko für Konflikte):

1. https://discord.com/developers/applications → New Application
2. Bot → Reset Token → in `.env` eintragen
3. Bot → **SERVER MEMBERS INTENT** aktivieren (Privileged Gateway Intents)
4. OAuth2 → URL Generator → Scope `bot` anhaken, Permissions:
   - **Send Messages**
   - **Embed Links**
   - **Manage Roles** (nur nötig, wenn du die optionale Unverified-Rolle nutzt)
5. Mit dem generierten Link auf den Server "The Abyssal Emperors" einladen

### 2. Projekt einrichten

```bash
npm install
```

Die Datei `env.example.txt` in `.env` umbenennen (Punkt am Anfang, keine
Endung) und ausfüllen:

- `DISCORD_TOKEN` – Token dieses Bots
- `GUILD_ID` – Server-ID von "The Abyssal Emperors"
- `WELCOME_CHANNEL_ID` – Channel-ID von `#welcome` oder `#general`
- `VERIFY_CHANNEL_ID` – Channel-ID von `#verify`
- `VERIFIED_ROLE_ID` – ID der bereits existierenden Verified-Rolle
- `UNVERIFIED_ROLE_ID` – optional, ID einer Guest-Rolle
- `REMINDER_MINUTES` – nach wie vielen Minuten erinnert wird (Standard 10)
- `REMINDER_DM_ENABLED` / `REMINDER_CHANNEL_FALLBACK` – Erinnerungsverhalten steuern

Alle IDs bekommst du per Rechtsklick → "ID kopieren" (Entwicklermodus muss in
den Discord-Einstellungen unter Erweitert aktiviert sein).

### 3. Bot starten

```bash
npm start
```

## Zusammenlaufen mit dem Verify-Bot

Dieser Bot ist als **eigener Prozess mit eigenem Token** gebaut – das ist die
sauberste Lösung, da beide Bots komplett unabhängig laufen und sich technisch
nicht in die Quere kommen können. Du startest also einfach beide Ordner
parallel (z. B. zwei `pm2`-Prozesse oder zwei Terminal-Fenster).

**Alternative:** Falls du lieber nur einen einzigen Bot/Prozess betreiben
willst, kannst du den Inhalt von `guildMemberAdd` aus dieser `index.js` in
die `index.js` deines Verify-Bots kopieren (die Dateien `storage.js` und
`welcome-message.js` einfach mit in den Verify-Bot-Ordner legen, ggf. umbenennen
falls es dort schon eine `storage.js` gibt, z. B. `welcome-storage.js`). Dann
reicht ein gemeinsames `.env` mit allen IDs aus beiden Projekten.

## Dateien

- `index.js` – Event-Logik (Join, Reminder-Scheduling, Recovery nach Neustart)
- `welcome-message.js` – Baut Willkommens- und Erinnerungsnachricht (Abyssal-Theme)
- `storage.js` – Speichert begrüßte User und Erinnerungsstatus (JSON-Dateien)
- `greeted_users.json` / `reminder_status.json` – werden automatisch beim ersten Lauf erzeugt

## Hinweise

- Die Bot-Rolle muss über der `Unverified`-Rolle stehen, falls du diese nutzt
  (gleiches Prinzip wie beim Verify-Bot)
- Erinnerungen respektieren fehlgeschlagene DMs (z. B. wenn jemand keine DMs
  von Servermitgliedern erlaubt) und weichen dann automatisch auf den
  Welcome-Channel aus, statt einfach nichts zu tun
- Für 24/7-Betrieb z. B. mit `pm2 start index.js --name abyssal-welcome` laufen lassen
