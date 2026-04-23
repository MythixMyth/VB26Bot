import { verifyKey } from "discord-interactions";
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes
} from "discord-interactions";

import {
  getPlayerData,
  publishMessage,
  writeBan,
  writePendingCommand,
  parseDuration,
  getPlayerUsername,
  getPlayerThumbnail
} from "../../roblox.js"; // adjust path if needed

// Cache (same as your original)
const infoCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function cacheSet(key, value) {
  infoCache.set(key, { data: value, expires: Date.now() + CACHE_TTL });
}

function cacheGet(key) {
  const entry = infoCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    infoCache.delete(key);
    return null;
  }
  return entry.data;
}

// Your helper functions (copy them exactly from your file)
// getOption, formatHeight, formatWeight, formatTrait, statBar,
// buildOverviewEmbed, buildStatsEmbed, buildPageSelect
// (I’m not rewriting them here — just paste them exactly as-is)

export default async function handler(req, res) {
  // Vercel requires raw body for signature verification
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];

  const rawBody = JSON.stringify(req.body);

  const isValid = verifyKey(
    rawBody,
    signature,
    timestamp,
    process.env.PUBLIC_KEY
  );

  if (!isValid) {
    return res.status(401).send("invalid request signature");
  }

  const { type, data, member } = req.body;

  // PING
  if (type === InteractionType.PING) {
    return res.status(200).send({ type: InteractionResponseType.PONG });
  }

  // Slash commands
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = data;

    // ---- /ingameban ----
    if (name === "ingameban") {
      const userId = getOption(options, "userid");
      const durationStr = getOption(options, "duration");
      const reason = getOption(options, "reason");

      const duration = parseDuration(durationStr);
      if (!duration) {
        return res.status(200).send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL,
            content:
              "Invalid duration format. Use: `30m`, `2h`, `7d`, `1w`, or `perm`"
          }
        });
      }

      try {
        const username = await getPlayerUsername(userId);
        const isPermanent = duration.seconds === -1;
        const expiry = isPermanent
          ? -1
          : Math.floor(Date.now() / 1000) + duration.seconds;

        const banData = {
          reason,
          expiry,
          permanent: isPermanent,
          bannedBy: member.user.username,
          bannedAt: Math.floor(Date.now() / 1000)
        };

        await writeBan(userId, banData);
        await publishMessage({
          command: "ban",
          userId: String(userId),
          reason,
          duration: duration.label
        });

        return res.status(200).send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: "🔨 Player Banned",
                color: 0xff4444,
                fields: [
                  {
                    name: "Player",
                    value: username
                      ? `${username} (\`${userId}\`)`
                      : `\`${userId}\``,
                    inline: true
                  },
                  {
                    name: "Duration",
                    value: isPermanent ? "**Permanent**" : duration.label,
                    inline: true
                  },
                  { name: "Banned By", value: member.user.username, inline: true },
                  { name: "Reason", value: `>>> ${reason}` }
                ],
                timestamp: new Date().toISOString()
              }
            ]
          }
        });
      } catch (err) {
        console.error("Ban error:", err);
        return res.status(200).send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL,
            content: `Failed to ban player: ${err.message}`
          }
        });
      }
    }

    // ---- /info ----
    if (name === "info") {
      const userId = getOption(options, "userid");
      const slot = getOption(options, "slot");

      try {
        const [profileData, username, thumbnail] = await Promise.all([
          getPlayerData(userId),
          getPlayerUsername(userId),
          getPlayerThumbnail(userId)
        ]);

        if (!profileData) {
          return res.status(200).send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.EPHEMERAL,
              content: "No data found for this player."
            }
          });
        }

        const playerData = profileData.Data || profileData;
        const slots = playerData.Slots;
        const slotData = slots ? slots[String(slot)] : null;

        if (!slotData || slotData.createdAt === 0) {
          return res.status(200).send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.EPHEMERAL,
              content: `Slot ${slot} is empty for this player.`
            }
          });
        }

        const cacheKey = `${userId}_${slot}_${Date.now()}`;
        const info = { username, userId, slot, slotData, thumbnail };
        cacheSet(cacheKey, info);

        return res.status(200).send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [buildOverviewEmbed(info)],
            components: [buildPageSelect(cacheKey, "overview")]
          }
        });
      } catch (err) {
        console.error("Info error:", err);
        return res.status(200).send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL,
            content: `Failed to fetch player info: ${err.message}`
          }
        });
      }
    }

    // ---- /setmoney ----
    if (name === "setmoney") {
      const userId = getOption(options, "userid");
      const amount = getOption(options, "amount");

      try {
        const username = await getPlayerUsername(userId);
        const commandId = `${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`;

        await writePendingCommand(userId, {
          id: commandId,
          command: "setmoney",
          amount,
          issuedBy: member.user.username,
          issuedAt: Math.floor(Date.now() / 1000)
        });

        await publishMessage({
          command: "setmoney",
          userId: String(userId),
          amount
        });

        return res.status(200).send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: "💰 V$ Set",
                color: 0x2ecc71,
                fields: [
                  {
                    name: "Player",
                    value: username
                      ? `${username} (\`${userId}\`)`
                      : `\`${userId}\``,
                    inline: true
                  },
                  {
                    name: "Amount",
                    value: `**V$${amount.toLocaleString()}**`,
                    inline: true
                  },
                  { name: "Set By", value: member.user.username, inline: true }
                ],
                footer: {
                  text:
                    "Applies immediately if online, otherwise on next join"
                },
                timestamp: new Date().toISOString()
              }
            ]
          }
        });
      } catch (err) {
        console.error("SetMoney error:", err);
        return res.status(200).send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL,
            content: `Failed to set V$: ${err.message}`
          }
        });
      }
    }

    // ---- /addmoney ----
    if (name === "addmoney") {
      const userId = getOption(options, "userid");
      const amount = getOption(options, "amount");

      try {
        const username = await getPlayerUsername(userId);
        const commandId = `${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`;

        await writePendingCommand(userId, {
          id: commandId,
          command: "addmoney",
          amount,
          issuedBy: member.user.username,
          issuedAt: Math.floor(Date.now() / 1000)
        });

        await publishMessage({
          command: "addmoney",
          userId: String(userId),
          amount
        });

        return res.status(200).send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: "💰 V$ Added",
                color: 0x2ecc71,
                fields: [
                  {
                    name: "Player",
                    value: username
                      ? `${username} (\`${userId}\`)`
                      : `\`${userId}\``,
                    inline: true
                  },
                  {
                    name: "Amount",
                    value: `**+V$${amount.toLocaleString()}**`,
                    inline: true
                  },
                  { name: "Added By", value: member.user.username, inline: true }
                ],
                footer: {
                  text:
                    "Applies immediately if online, otherwise on next join"
                },
                timestamp: new Date().toISOString()
              }
            ]
          }
        });
      } catch (err) {
        console.error("AddMoney error:", err);
        return res.status(200).send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL,
            content: `Failed to add V$: ${err.message}`
          }
        });
      }
    }

    return res.status(400).json({ error: "unknown command" });
  }

  // Component interactions
  if (type === InteractionType.MESSAGE_COMPONENT) {
    const componentId = data.custom_id;

    if (componentId.startsWith("info_page_")) {
      const cacheKey = componentId.replace("info_page_", "");
      const selectedPage = data.values[0];
      const info = cacheGet(cacheKey);

      if (!info) {
        return res.status(200).send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            content: "This info lookup has expired. Please run `/info` again.",
            embeds: [],
            components: []
          }
        });
      }

      const embed =
        selectedPage === "stats"
          ? buildStatsEmbed(info)
          : buildOverviewEmbed(info);

      return res.status(200).send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: {
          embeds: [embed],
          components: [buildPageSelect(cacheKey, selectedPage)]
        }
      });
    }

    return res.status(200).end();
  }

  return res.status(400).json({ error: "unknown interaction type" });
}
