"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const PlayFab_1 = require("../../../services/PlayFab");
const BaseRCONCommands_1 = __importDefault(require("../../../structures/BaseRCONCommands"));
class Kick extends BaseRCONCommands_1.default {
    constructor(bot, commandName) {
        super(bot, {
            name: commandName,
            usage: "kick <player name/id> [--reason string]",
            adminsOnly: true,
            options: [
                {
                    names: ["reason", "r"],
                    type: "string",
                    help: "Reason of the ban",
                },
            ],
        });
    }
    async execute(ctx) {
        if (!ctx.args.length)
            return await ctx.say("Provide a player name or id");
        const admin = ctx.bot.cachedPlayers.get(ctx.player.id) || {
            server: ctx.rcon.options.name,
            ...(await ctx.rcon.getPlayerToCache(ctx.player.id)),
        };
        const name = ctx.args.join(" ");
        const ingamePlayer = await ctx.rcon.getIngamePlayer(name);
        const player = this.bot.cachedPlayers.get(ingamePlayer === null || ingamePlayer === void 0 ? void 0 : ingamePlayer.id) || {
            server: ctx.rcon.options.name,
            ...(await PlayFab_1.LookupPlayer(ingamePlayer === null || ingamePlayer === void 0 ? void 0 : ingamePlayer.id)),
        };
        if (!(player === null || player === void 0 ? void 0 : player.id)) {
            return await ctx.say("Invalid player provided");
        }
        const reason = ctx.opts.reason;
        const error = await ctx.rcon.kickUser(ctx.rcon.options.name, admin, player, reason);
        if (error)
            await ctx.say(error);
    }
}
exports.default = Kick;
