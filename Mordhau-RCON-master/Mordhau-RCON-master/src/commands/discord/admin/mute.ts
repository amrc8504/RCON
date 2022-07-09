import flatMap from "array.prototype.flatmap";
import BigNumber from "bignumber.js";
import pluralize from "pluralize";
import {
    ApplicationCommandPermissionType,
    CommandContext,
    CommandOptionType,
    Message,
    SlashCreator,
} from "slash-create";
import { LookupPlayer } from "../../../services/PlayFab";
import config, { Role } from "../../../structures/Config";
import SlashCommand from "../../../structures/SlashCommand";
import Watchdog from "../../../structures/Watchdog";
import logger from "../../../utils/logger";
import { outputPlayerIDs } from "../../../utils/PlayerID";

export default class Mute extends SlashCommand {
    constructor(creator: SlashCreator, bot: Watchdog, commandName: string) {
        super(creator, bot, {
            name: commandName,
            description: "Mute a player",
            options: [
                {
                    name: "server",
                    description: "Server to run the command on",
                    required: true,
                    type: CommandOptionType.STRING,
                    choices: config.get("servers").map((server) => ({
                        name: server.name,
                        value: server.name,
                    })),
                },
                {
                    name: "player",
                    description: "PlayFab ID or name of the player",
                    required: true,
                    type: CommandOptionType.STRING,
                },
                {
                    name: "duration",
                    description: "Duration of the mute in minutes",
                    required: true,
                    type: CommandOptionType.INTEGER,
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
        const options = {
            server: ctx.options.server as string,
            player: ctx.options.player as string,
            duration: new BigNumber(ctx.options.duration as number),
        };

        const server = this.bot.servers.get(options.server);
        if (!server) {
            return (await ctx.send(
                `Server not found, existing servers are: ${[
                    ...this.bot.servers.keys(),
                ].join(", ")}`
            )) as Message;
        }
        if (!server.rcon.connected || !server.rcon.authenticated) {
            return (await ctx.send(
                `Not ${
                    !server.rcon.connected ? "connected" : "authenticated"
                } to server`
            )) as Message;
        }

        const ingamePlayer = await server.rcon.getIngamePlayer(options.player);
        const player = this.bot.cachedPlayers.get(
            ingamePlayer?.id || options.player
        ) || {
            server: server.name,
            ...(await LookupPlayer(ingamePlayer?.id || options.player)),
        };
        const duration = options.duration;

        if (!player?.id) {
            return await ctx.send("Invalid player provided");
        }

        try {
            if (config.get("syncServerPunishments")) {
                const result = await this.bot.rcon.globalMute(
                    {
                        ids: { playFabID: ctx.member.id },
                        id: ctx.member.id,
                        name: `${ctx.member.displayName}#${ctx.member.user.discriminator}`,
                    },
                    player,
                    duration,
                    options.server
                );

                const failedServers = result.filter(
                    (result) => result.data.failed
                );

                const allServersFailed =
                    this.bot.servers.size === failedServers.length;

                await ctx.send({
                    embeds: [
                        {
                            description: [
                                `${
                                    allServersFailed ? "Tried to mute" : "Muted"
                                } ${player.name} (${outputPlayerIDs(
                                    player.ids,
                                    true
                                )})\n`,
                                `Duration: ${
                                    options.duration.isEqualTo(0)
                                        ? "PERMANENT"
                                        : pluralize(
                                              "minute",
                                              options.duration.toNumber(),
                                              true
                                          )
                                }`,
                            ].join("\n"),
                            ...(failedServers.length && {
                                fields: [
                                    {
                                        name: "Failed servers",
                                        value: failedServers
                                            .map(
                                                (server) =>
                                                    `${server.name} (${server.data.result})`
                                            )
                                            .join("\n"),
                                    },
                                ],
                            }),
                        },
                    ],
                });
            } else {
                const error = await server.rcon.muteUser(
                    player.server,
                    {
                        ids: { playFabID: ctx.member.id },
                        id: ctx.member.id,
                        name: `${ctx.member.displayName}#${ctx.member.user.discriminator}`,
                    },
                    player,
                    duration
                );

                if (error) {
                    return (await ctx.send(error)) as Message;
                }

                await ctx.send({
                    embeds: [
                        {
                            description: [
                                `Muted player ${player.name} (${outputPlayerIDs(
                                    player.ids,
                                    true
                                )})\n`,
                                `Server: ${server.name}`,
                                `Duration: ${
                                    options.duration.isEqualTo(0)
                                        ? "PERMANENT"
                                        : pluralize(
                                              "minute",
                                              options.duration.toNumber(),
                                              true
                                          )
                                }`,
                            ].join("\n"),
                        },
                    ],
                });
            }

            logger.info(
                "Command",
                `${ctx.member.displayName}#${ctx.member.user.discriminator} muted ${player.name} (${player.id}) (Duration: ${duration})`
            );
        } catch (error) {
            await ctx.send({
                content: `An error occured while performing the command (${
                    error.message || error
                })`,
            });
        }
    }
}
