import flatMap from "array.prototype.flatmap";
import pluralize from "pluralize";
import {
    ApplicationCommandPermissionType,
    CommandContext,
    CommandOptionType,
    SlashCreator,
} from "slash-create";
import { LookupPlayer } from "../../../services/PlayFab";
import config, { Role } from "../../../structures/Config";
import SlashCommand from "../../../structures/SlashCommand";
import Watchdog from "../../../structures/Watchdog";
import { outputPlayerIDs } from "../../../utils/PlayerID";

export default class Banned extends SlashCommand {
    constructor(creator: SlashCreator, bot: Watchdog, commandName: string) {
        super(creator, bot, {
            name: commandName,
            description: "Check if a player is banned and the duration",
            options: [
                {
                    name: "player",
                    description: "PlayFab ID or name of the player",
                    required: true,
                    type: CommandOptionType.STRING,
                },
            ],
            dmPermission: false,
            requiredPermissions: [],
            // permissions: Object.assign(
            //     {},
            //     ...bot.client.guilds.map((guild) => ({
            //         [guild.id]: flatMap(
            //             (config.get("discord.roles") as Role[]).filter((role) =>
            //                 role.commands.includes(commandName)
            //             ),
            //             (role) =>
            //                 role.Ids.map((id) => ({
            //                     type: ApplicationCommandPermissionType.ROLE,
            //                     id,
            //                     permission: true,
            //                 }))
            //         ),
            //     }))
            // ),
        });
    }

    hasPermission(ctx: CommandContext): string | boolean {
        // const permissions = Object.assign(
        //     {},
        //     ...this.bot.client.guilds.map((guild) => ({
        //         [guild.id]: flatMap(
        //             (config.get("discord.roles") as Role[]).filter((role) =>
        //                 role.commands.includes(this.commandName)
        //             ),
        //             (role) =>
        //                 role.Ids.map((id) => ({
        //                     type: ApplicationCommandPermissionType.ROLE,
        //                     id,
        //                     permission: true,
        //                 }))
        //         ),
        //     }))
        // );

        // return (
        //     permissions[ctx.guildID]?.some((permission) =>
        //         ctx.member.roles.includes(permission.id)
        //     ) ?? false
        // );

        return ctx.member.roles.some((r) =>
            (config.get("discord.roles") as Role[])
                .filter((role) => role.commands.includes(this.commandName))
                .find((role) => role.Ids.includes(r))
        );
    }

    async run(ctx: CommandContext) {
        await ctx.defer();
        try {
            const id = ctx.options.player as string;
            const servers = await this.bot.rcon.getBannedPlayer(id);
            const fields: { name: string; value: string }[] = [];

            const player =
                this.bot.cachedPlayers.get(id) || (await LookupPlayer(id));

            if (!player?.id) {
                return await ctx.send("Invalid player provided");
            }

            // if (!servers.length) {
            //     return { content: "Player not banned" };
            // }

            for (let i = 0; i < servers.length; i++) {
                const server = servers[i];

                fields.push({
                    name: server.server,
                    value: !server.data
                        ? "Player not banned"
                        : `Duration: ${
                              server.data.duration.isEqualTo(0)
                                  ? "Permanent"
                                  : pluralize(
                                        "minute",
                                        server.data.duration.toNumber(),
                                        true
                                    )
                          }`,
                });
            }

            if (!fields.length) {
                return await ctx.send(
                    `${player.name} (${outputPlayerIDs(
                        player.ids,
                        true
                    )}) is not banned`
                );
            }

            await ctx.send({
                embeds: [
                    {
                        description: [
                            `**Banned Player:**`,
                            `Name: ${player.name}`,
                            `PlayFabID: ${player.ids.playFabID}`,
                            `SteamID: ${player.ids.steamID}`,
                        ].join("\n"),
                        fields,
                    },
                ],
            });
        } catch (error) {
            await ctx.send(
                `An error occured while performing the command (${
                    error.message || error
                })`
            );
        }
    }
}
