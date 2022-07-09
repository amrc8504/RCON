import flatMap from "array.prototype.flatmap";
import BigNumber from "bignumber.js";
import Conf from "conf";
import pluralize from "pluralize";
import english from "retext-english";
import factory from "retext-profanities/factory.js";
import stringify from "retext-stringify";
import unified, { Processor, Settings } from "unified";
import { sendWebhookMessage } from "../services/Discord";
import logger from "../utils/logger";
import parseOut from "../utils/parseOut";
import { outputPlayerIDs } from "../utils/PlayerID";
import config, { InfractionThreshold } from "./Config";
import Rcon from "./Rcon";
import Watchdog from "./Watchdog";

interface IOptions {
    name?: string;
}

export interface Punishment {
    type: "message" | "mute" | "kick" | "ban" | "globalmute" | "globalban";
    message: string;
    duration?: number;
    reason?: string;
}

export default class AutoMod {
    private bot: Watchdog;
    public profaneWords: string[];
    public options: IOptions;
    private stringChecker: Processor<Settings>;

    constructor(bot: Watchdog, options?: IOptions) {
        this.options = options || {
            name: "AutoMod",
        };
        this.bot = bot;
        const config = new Conf({
            configName: "bannedWords",
            cwd: "./",
            accessPropertiesByDotNotation: true,
            schema: {
                words: {
                    type: "array",
                    items: {
                        type: "string",
                    },
                    minItems: 1,
                    uniqueItems: true,
                },
            },
            defaults: {
                words: [
                    "beaners",
                    "beaner",
                    "bimbo",
                    "coon",
                    "coons",
                    "cunt",
                    "cunts",
                    "darkie",
                    "darkies",
                    "fag",
                    "fags",
                    "faggot",
                    "faggots",
                    "gook",
                    "hooker",
                    "kike",
                    "kikes",
                    "nazi",
                    "nazis",
                    "neonazi",
                    "neonazis",
                    "negro",
                    "negros",
                    "nigga",
                    "niggas",
                    "nigger",
                    "niggers",
                    "niglet",
                    "paki",
                    "pakis",
                    "raghead",
                    "ragheads",
                    "shemale",
                    "shemales",
                    "slut",
                    "sluts",
                    "spic",
                    "spics",
                    "swastika",
                    "towelhead",
                    "towelheads",
                    "tranny",
                    "trannys",
                    "trannies",
                    "twink",
                    "twinks",
                    "wetback",
                    "wetbacks",
                ],
            },
        });
        this.profaneWords = config.get("words") as string[];
        this.stringChecker = unified()
            .use(english)
            .use(
                factory({
                    lang: "en",
                    cuss: this.profaneWords.reduce((result, word) => {
                        result[word] = 1;
                        return result;
                    }, {}),
                    pluralize: require("pluralize"),
                    // Misclassified singulars and plurals.
                    ignorePluralize: [
                        "children",
                        "dy", // Singular of `dies`.
                        "pro", // Singular of `pros`.
                        "so", // Singular of `sos`.
                        "dice", // Plural of `die`.
                        "fus", // Plural of `fu`.
                    ],
                    // List of values not to normalize.
                    regular: ["hell"],
                })
            )
            .use(stringify);
    }

    private sendMessage(
        webhookCredentials: { id: string; token: string },
        message: string
    ) {
        return sendWebhookMessage(webhookCredentials, message);
    }

    public async getSlurs(
        rcon: Rcon,
        player: {
            ids: { playFabID: string; steamID: string };
            id: string;
            name: string;
        },
        message: string
    ) {
        if (config.get("automod.adminsBypass") && rcon.admins.has(player.id))
            return;

        const result = await this.stringChecker.process(message);

        if (!result.messages.length) return;

        return result.messages.map((word) => word.ruleId);
    }

    public async check(
        rcon: Rcon,
        player: {
            ids: { playFabID: string; steamID: string };
            id: string;
            name: string;
        },
        message: string
    ) {
        if (config.get("automod.adminsBypass") && rcon.admins.has(player.id))
            return;

        const result = await this.stringChecker.process(message);

        if (!result.messages.length) return;

        const profaneWords = result.messages.map((word) => word.ruleId);

        logger.debug(
            this.options.name,
            `${player.name} (${outputPlayerIDs(
                player.ids
            )}) sent a profane message (Server: ${
                rcon.options.name
            }, Message: ${message}, Profane words: ${profaneWords.join(", ")})`
        );

        const playerMessages =
            await this.bot.database.Infractions.findOneAndUpdate(
                { id: player.id },
                { $inc: { infractions: 1 }, $push: { words: profaneWords } },
                { new: true, upsert: true }
            );

        const allProfaneWords = flatMap(
            playerMessages.words,
            (words) => words
        ).join(", ");

        const infractionThresholds = config.get("automod.infractionThresholds");
        const highestInfractionThreshold = parseInt(
            Object.keys(infractionThresholds).reduce((a, b) =>
                parseInt(a) > parseInt(b) ? a : b
            )
        );
        const infractionIteration =
            playerMessages.infractions / highestInfractionThreshold;

        function onlyDecimals(value: number) {
            value = Math.abs(value);
            return Number((value - Math.floor(value)).toFixed(3));
        }

        function compareDecimals(first: number, second: number) {
            return onlyDecimals(first) === onlyDecimals(second);
        }

        for (const infractionsThreshhold in infractionThresholds as {
            [key: string]: InfractionThreshold;
        }) {
            if (
                compareDecimals(
                    parseInt(infractionsThreshhold) /
                        highestInfractionThreshold,
                    infractionIteration
                )
            ) {
                const punishment: Punishment = config.get(
                    `automod.infractionThresholds.${infractionsThreshhold}`
                );
                const server = this.bot.cachedPlayers.get(player.id)?.server;
                const admin = {
                    ids: { playFabID: "1337" },
                    id: "1337",
                    name: this.options.name,
                };
                const message = punishment.message
                    .replace(/{name}/g, player.name)
                    .replace(/{words}/g, allProfaneWords);
                const reason = `${this.options.name}: ${punishment.reason}`
                    .replace(/{name}/g, player.name)
                    .replace(/{words}/g, allProfaneWords);
                const duration = new BigNumber(
                    infractionIteration > 1
                        ? punishment.duration * Math.ceil(infractionIteration)
                        : punishment.duration
                );

                switch (punishment.type) {
                    case "message": {
                        await rcon.say(`${this.options.name}: ${message}`);

                        break;
                    }
                    case "mute": {
                        const error = await rcon.muteUser(
                            server,
                            admin,
                            player,
                            duration
                        );

                        if (error) {
                            logger.error(
                                this.options.name,
                                `Error occurred while muting ${
                                    player.name
                                } (${outputPlayerIDs(player.ids)}) (${error})`
                            );
                        } else {
                            await rcon.say(`${this.options.name}: ${message}`);
                        }

                        break;
                    }
                    case "kick": {
                        const error = await rcon.kickUser(
                            server,
                            admin,
                            player,
                            reason
                        );

                        if (error) {
                            logger.error(
                                this.options.name,
                                `Error occurred while kicking ${
                                    player.name
                                } (${outputPlayerIDs(player.ids)}) (${error})`
                            );
                        } else {
                            await rcon.say(`${this.options.name}: ${message}`);
                        }

                        break;
                    }
                    case "ban": {
                        const error = await rcon.banUser(
                            server,
                            admin,
                            player,
                            duration,
                            reason
                        );

                        if (error) {
                            logger.error(
                                this.options.name,
                                `Error occurred while banning ${
                                    player.name
                                } (${outputPlayerIDs(player.ids)}) (${error})`
                            );
                        } else {
                            await rcon.say(`${this.options.name}: ${message}`);
                        }

                        break;
                    }
                    case "globalmute": {
                        const result = await this.bot.rcon.globalMute(
                            admin,
                            player,
                            duration
                        );
                        const failedServers = result.filter(
                            (result) => result.data.failed
                        );

                        if (failedServers.length) {
                            logger.error(
                                this.options.name,
                                `Error occurred while globally muting ${
                                    player.name
                                } (${outputPlayerIDs(
                                    player.ids
                                )}) (Failed to mute on ${pluralize(
                                    "server",
                                    failedServers.length
                                )}: ${failedServers
                                    .map(
                                        (server) =>
                                            `${server.name} (${server.data.result})`
                                    )
                                    .join(", ")})`
                            );
                        } else {
                            await rcon.say(`${this.options.name}: ${message}`);
                        }

                        break;
                    }
                    case "globalban": {
                        const result = await this.bot.rcon.globalBan(
                            admin,
                            player,
                            duration,
                            reason
                        );
                        const failedServers = result.filter(
                            (result) => result.data.failed
                        );

                        if (failedServers.length) {
                            logger.error(
                                this.options.name,
                                `Error occurred while globally banning ${
                                    player.name
                                } (${outputPlayerIDs(
                                    player.ids
                                )}) (Failed to ban on ${pluralize(
                                    "server",
                                    failedServers.length
                                )}: ${failedServers
                                    .map(
                                        (server) =>
                                            `${server.name} (${server.data.result})`
                                    )
                                    .join(", ")})`
                            );
                        } else {
                            await rcon.say(`${this.options.name}: ${message}`);
                        }

                        break;
                    }
                }

                this.sendMessage(
                    rcon.webhooks.get("automod"),
                    `${
                        punishment.type === "globalban"
                            ? "Globally ban"
                            : punishment.type === "globalmute"
                            ? "Globally mute"
                            : punishment.type[0].toUpperCase() +
                              punishment.type.substr(1)
                    }${
                        ["ban", "globalban"].includes(punishment.type)
                            ? "ned"
                            : ["warn", "kick"].includes(punishment.type)
                            ? "ed"
                            : "d"
                    } ${parseOut(player.name)} (${outputPlayerIDs(
                        player.ids,
                        true
                    )}) for profane message (Server: ${rcon.options.name}${
                        duration
                            ? `, Duration: ${pluralize(
                                  "minute",
                                  duration.toNumber(),
                                  true
                              )}`
                            : ""
                    }, Threshold: ${infractionsThreshhold}, Messages: ${
                        playerMessages.infractions
                    }, Profane words: ${allProfaneWords})`
                );

                logger.info(
                    this.options.name,
                    `${
                        punishment.type === "globalban"
                            ? "Globally ban"
                            : punishment.type === "globalmute"
                            ? "Globally mute"
                            : punishment.type[0].toUpperCase() +
                              punishment.type.substr(1)
                    }${
                        ["ban", "globalban"].includes(punishment.type)
                            ? "ned"
                            : ["warn", "kick"].includes(punishment.type)
                            ? "ed"
                            : "d"
                    } ${player.name} (${outputPlayerIDs(
                        player.ids
                    )}) for profane message (Server: ${rcon.options.name}${
                        duration
                            ? `, Duration: ${pluralize(
                                  "minute",
                                  duration.toNumber(),
                                  true
                              )}`
                            : ""
                    }, Threshold: ${infractionsThreshhold}, Messages: ${
                        playerMessages.infractions
                    }, Profane words: ${allProfaneWords})`
                );

                if (config.get("automod.infiniteDurationScaling")) return;

                if (
                    parseInt(infractionsThreshhold) >=
                    highestInfractionThreshold
                ) {
                    await this.bot.database.Infractions.deleteOne({
                        id: player.id,
                    });

                    logger.info(
                        this.options.name,
                        `Reset ${player.name} (${outputPlayerIDs(
                            player.ids
                        )}) infractions`
                    );
                }

                return;
            }
        }
    }
}
