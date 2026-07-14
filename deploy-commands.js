require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Fehler: DISCORD_TOKEN und CLIENT_ID müssen in der .env gesetzt sein.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registriere ${commands.length} Slash-Command(s)...`);

    if (GUILD_ID) {
      // Guild-Commands: sofort verfügbar, gut zum Testen
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
        body: commands
      });
      console.log(`Commands wurden auf Server ${GUILD_ID} registriert (sofort aktiv).`);
    } else {
      // Globale Commands: kann bis zu 1 Stunde dauern, bis sie überall sichtbar sind
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('Globale Commands wurden registriert (Verzögerung bis ~1h möglich).');
    }
  } catch (error) {
    console.error('Fehler beim Registrieren der Commands:', error);
  }
})();