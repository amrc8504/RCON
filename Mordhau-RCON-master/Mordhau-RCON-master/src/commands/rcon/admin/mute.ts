import BigNumber from "bignumber.js";
import { LookupPlayer } from "../../../services/PlayFab";
import BaseRCONCommand from "../../../structures/BaseRCONCommands";
import RCONCommandContext from "../../../structures/RCONCommandContext";
import Watchdog from "../../../structures/Watchdog";

export default class Mute extends BaseRCONCommand {
    constructor(bot: Watchdog, commandName: string) {
        super(bot, {
            name: commandName,
            usage: "mute <player name/id> [--duration positiveInteger]",
            adminsOnly: true,
            options: [
                {
                    names: ["duration", "d"],
                    type: "positiveInteger",
                    help: "Duration of the mute",
                },
            ],
        });
    }

    async execute(ctx: RCONCommandContext) {
        if (!ctx.args.length)
            return await ctx.say("Provide a player name or id");
        if (!ctx.opts.duration) {
            return await ctx.say("Provide a duration");
        }

        const admin = ctx.bot.cachedPlayers.get(ctx.player.id) || {
            server: ctx.rcon.options.name,
            ...(await ctx.rcon.getPlayerToCache(ctx.player.id)),
        };

        const name = ctx.args.join(" ");
        const ingamePlayer = await ctx.rcon.getIngamePlayer(name);
        const player = this.bot.cachedPlayers.get(ingamePlayer?.id || name) || {
            server: ctx.rcon.options.name,
            ...(await LookupPlayer(ingamePlayer?.id || name)),
        };

        if (!player?.id) {
            return await ctx.say("Invalid player provided");
        }

        const duration = new BigNumber(ctx.opts.duration as number);

        const error = await ctx.rcon.muteUser(
            ctx.rcon.options.name,
            admin,
            player,
            duration
        );
        if (error) await ctx.say(error);
    }
}
