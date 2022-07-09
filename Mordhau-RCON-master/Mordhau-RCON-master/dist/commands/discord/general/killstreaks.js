"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pluralize_1 = __importDefault(require("pluralize"));
const SlashCommand_1 = __importDefault(require("../../../structures/SlashCommand"));
const utils_1 = require("../../../utils");
class Killstreaks extends SlashCommand_1.default {
    constructor(creator, bot, commandName) {
        super(creator, bot, {
            name: commandName,
            description: "Get all players killstreaks",
        });
    }
    async run(ctx) {
        await ctx.defer();
        const killstreaks = this.bot.rcon.getKillstreaks();
        const onlinePlayers = await this.bot.rcon.getIngamePlayers();
        const players = [];
        const fields = [];
        for (let i = 0; i < killstreaks.length; i++) {
            const server = killstreaks[i];
            for (const [_, data] of server.data) {
                players.push(data);
            }
            let message = players
                .sort((a, b) => b.kills - a.kills)
                .map((killstreak, index) => `${index + 1}. ${killstreak.player.name}: ${pluralize_1.default("kill", killstreak.kills, true)}`)
                .join("\n");
            if (!message.length)
                message = "No one has any kills, what a sad gamer moment.";
            if (message.length > 1023)
                message = `The output was too long, but was uploaded to [paste.gg](${await utils_1.hastebin(message)})`;
            fields.push({
                name: server.server,
                value: message,
            });
        }
        await ctx.send({
            embeds: [
                {
                    description: [
                        `**Killstreaks (${killstreaks.reduce((a, b) => a + b.data.size, 0)}/${pluralize_1.default("player", onlinePlayers.reduce((acc, server) => acc + server.players.length, 0), true)}): **\n`,
                    ].join("\n"),
                    fields,
                },
            ],
        });
    }
}
exports.default = Killstreaks;
