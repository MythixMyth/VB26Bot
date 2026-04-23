import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import {
  getPlayerData,
  publishMessage,
  writeBan,
  writePendingCommand,
  parseDuration,
  getPlayerUsername,
  getPlayerThumbnail,
} from './roblox.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Cache for /info page switching ───
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

// ─── Constants ───
const POSITION_LABELS = {
  Setter: 'Setter',
  OutsideHitter: 'Outside Hitter',
  MiddleBlocker: 'Middle Blocker',
  OppositeHitter: 'Opposite Hitter',
  Libero: 'Libero',
};

const POSITION_COLORS = {
  Setter: 0xf1c40f,
  OutsideHitter: 0xe74c3c,
  MiddleBlocker: 0x3498db,
  OppositeHitter: 0xe67e22,
  Libero: 0x2ecc71,
};

const RARITY_ICONS = {
  Mythical: '✦',
  Regular: '◆',
};

const STAT_GROUPS = [
  {
    name: 'Spike',
    icon: '🏐',
    stats: [
      { key: 'SpikePower', label: 'Power' },
      { key: 'SpikeSize', label: 'Size' },
      { key: 'Feint', label: 'Feint' },
      { key: 'TiltSpeed', label: 'Tilt Speed' },
    ],
  },
  {
    name: 'Setting',
    icon: '🤲',
    stats: [
      { key: 'SettingAccuracy', label: 'Accuracy' },
      { key: 'Setting', label: 'Setting' },
      { key: 'SettingSize', label: 'Size' },
    ],
  },
  {
    name: 'Block',
    icon: '🛡️',
    stats: [
      { key: 'BlockPower', label: 'Power' },
      { key: 'BlockReaction', label: 'Reaction' },
      { key: 'BlockSize', label: 'Size' },
      { key: 'BlockTechnique', label: 'Technique' },
    ],
  },
  {
    name: 'Receive',
    icon: '🙌',
    stats: [
      { key: 'ReceiveAccuracy', label: 'Accuracy' },
      { key: 'ReceiveReaction', label: 'Reaction' },
      { key: 'ReceiveSize', label: 'Size' },
    ],
  },
  {
    name: 'Movement',
    icon: '🏃‍♂️',
    stats: [
      { key: 'DiveSpeed', label: 'Dive Speed' },
      { key: 'DiveSize', label: 'Dive Size' },
      { key: 'GlideSpeed', label: 'Glide Speed' },
      { key: 'WalkSpeed', label: 'Walk Speed' },
      { key: 'JumpPower', label: 'Jump Power' },
    ],
  },
];

function getOption(options, name) {
  const opt = options.find((o) => o.name === name);
  return opt ? opt.value : null;
}

function formatHeight(meters) {
  const totalInches = meters * 39.3701;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${meters.toFixed(2)}m (${feet}'${inches}")`;
}

function formatWeight(kg) {
  const lbs = Math.round(kg * 2.20462);
  return `${kg}kg (${lbs}lbs)`;
}

function formatTrait(trait) {
  if (typeof trait === 'string') {
    return trait === 'None' ? null : `${RARITY_ICONS.Regular} ${trait}`;
  }
  if (trait && trait.name && trait.name !== 'None') {
    const icon = RARITY_ICONS[trait.rarity] || RARITY_ICONS.Regular;
    const rarityTag = trait.rarity === 'Mythical' ? ' *(Mythical)*' : '';
    return `${icon} ${trait.name}${rarityTag}`;
  }
  return null;
}

function statBar(value, max = 99) {
  const filled = Math.round((value / max) * 10);
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
}

function buildOverviewEmbed(info) {
  const { username, userId, slot, slotData, thumbnail } = info;
  const build = slotData.Build || {};
  const position = slotData.Position || 'Unknown';
  const posLabel = POSITION_LABELS[position] || position;
  const color = POSITION_COLORS[position] || 0x7289da;
  const traits = slotData.Traits || [];
  const ovr = slotData.OVR || 0;
  const slotName = slotData.Name || `Slot ${slot}`;
  const prestige = slotData.Prestige || 0;
  const stats = slotData.Stats || {};
  const ranked = stats.Ranked || {};
  const beach = stats.Beach || {};

  const traitLines = traits.map(formatTrait).filter(Boolean);
  const traitText = traitLines.length > 0 ? traitLines.join('\n') : '*None*';

  const embed = {
    title: `${slotName}`,
    description: `**${posLabel}** — OVR **${ovr}** — Prestige **${prestige}**`,
    color,
    fields: [
      {
        name: '👤 Player',
        value: username ? `[${username}](https://www.roblox.com/users/${userId}/profile) \`${userId}\`` : `\`${userId}\``,
        inline: false,
      },
      {
        name: '📏 Height',
        value: formatHeight(build.Height || 2),
        inline: true,
      },
      {
        name: '⚖️ Weight',
        value: formatWeight(build.Weight || 60),
        inline: true,
      },
      {
        name: '🧑‍🦲 Slot',
        value: String(slot),
        inline: true,
      },
      {
        name: '📖 Traits',
        value: traitText,
        inline: false,
      },
      {
        name: '🏆 Ranked',
        value: `\`Elo\` ${ranked.Elo || 0} · \`W\` ${ranked.Wins || 0} · \`L\` ${ranked.Loss || 0}`,
        inline: true,
      },
      {
        name: '🏖️ Beach',
        value: `\`Elo\` ${beach.Elo || 0} · \`W\` ${beach.Wins || 0} · \`L\` ${beach.Loss || 0}`,
        inline: true,
      },
    ],
    footer: { text: `Slot ${slot} · ${posLabel}` },
    timestamp: new Date().toISOString(),
  };

  if (thumbnail) {
    embed.thumbnail = { url: thumbnail };
  }

  return embed;
}

function buildStatsEmbed(info) {
  const { username, userId, slot, slotData, thumbnail } = info;
  const position = slotData.Position || 'Unknown';
  const posLabel = POSITION_LABELS[position] || position;
  const color = POSITION_COLORS[position] || 0x7289da;
  const charStats = slotData.CharacterStats || {};
  const ovr = slotData.OVR || 0;
  const slotName = slotData.Name || `Slot ${slot}`;

  const fields = [];

  for (const group of STAT_GROUPS) {
    const lines = [];
    for (const s of group.stats) {
      const val = charStats[s.key];
      if (val !== undefined) {
        lines.push(`\`${String(val).padStart(2)}\` ${statBar(val)} ${s.label}`);
      }
    }
    if (lines.length > 0) {
      fields.push({
        name: `${group.icon} ${group.name}`,
        value: lines.join('\n'),
        inline: false,
      });
    }
  }

  if (fields.length === 0) {
    fields.push({
      name: 'Character Stats',
      value: '*No stats allocated yet.*',
      inline: false,
    });
  }

  const embed = {
    title: `${slotName} — Stats`,
    description: `**${posLabel}** — OVR **${ovr}**`,
    color,
    fields,
    footer: { text: `Slot ${slot} · ${posLabel}` },
    timestamp: new Date().toISOString(),
  };

  if (thumbnail) {
    embed.thumbnail = { url: thumbnail };
  }

  return embed;
}

function buildPageSelect(cacheKey, currentPage) {
  return {
    type: MessageComponentTypes.ACTION_ROW,
    components: [
      {
        type: MessageComponentTypes.STRING_SELECT,
        custom_id: `info_page_${cacheKey}`,
        placeholder: 'Switch page...',
        options: [
          {
            label: 'Overview',
            value: 'overview',
            description: 'Build, traits, and record',
            default: currentPage === 'overview',
          },
          {
            label: 'Character Stats',
            value: 'stats',
            description: 'All stat breakdowns',
            default: currentPage === 'stats',
          },
        ],
      },
    ],
  };
}

app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { type, data, member } = req.body;

  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  // ─── Slash commands ───
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = data;

    // ─── /ingameban ───
    if (name === 'ingameban') {
      const userId = getOption(options, 'userid');
      const durationStr = getOption(options, 'duration');
      const reason = getOption(options, 'reason');

      const duration = parseDuration(durationStr);
      if (!duration) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL,
            content: 'Invalid duration format. Use: `30m`, `2h`, `7d`, `1w`, or `perm`',
          },
        });
      }

      try {
        const username = await getPlayerUsername(userId);
        const isPermanent = duration.seconds === -1;
        const expiry = isPermanent ? -1 : Math.floor(Date.now() / 1000) + duration.seconds;

        const banData = {
          reason,
          expiry,
          permanent: isPermanent,
          bannedBy: member.user.username,
          bannedAt: Math.floor(Date.now() / 1000),
        };

        await writeBan(userId, banData);
        await publishMessage({
          command: 'ban',
          userId: String(userId),
          reason,
          duration: duration.label,
        });

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [{
              title: '🔨 Player Banned',
              color: 0xff4444,
              fields: [
                { name: 'Player', value: username ? `${username} (\`${userId}\`)` : `\`${userId}\``, inline: true },
                { name: 'Duration', value: isPermanent ? '**Permanent**' : duration.label, inline: true },
                { name: 'Banned By', value: member.user.username, inline: true },
                { name: 'Reason', value: `>>> ${reason}` },
              ],
              timestamp: new Date().toISOString(),
            }],
          },
        });
      } catch (err) {
        console.error('Ban error:', err);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL,
            content: `Failed to ban player: ${err.message}`,
          },
        });
      }
    }

    // ─── /info ───
    if (name === 'info') {
      const userId = getOption(options, 'userid');
      const slot = getOption(options, 'slot');

      try {
        const [profileData, username, thumbnail] = await Promise.all([
          getPlayerData(userId),
          getPlayerUsername(userId),
          getPlayerThumbnail(userId),
        ]);

        if (!profileData) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.EPHEMERAL,
              content: 'No data found for this player.',
            },
          });
        }

        const playerData = profileData.Data || profileData;
        const slots = playerData.Slots;
        const slotData = slots ? slots[String(slot)] : null;

        if (!slotData || slotData.createdAt === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.EPHEMERAL,
              content: `Slot ${slot} is empty for this player.`,
            },
          });
        }

        const cacheKey = `${userId}_${slot}_${Date.now()}`;
        const info = { username, userId, slot, slotData, thumbnail };
        cacheSet(cacheKey, info);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [buildOverviewEmbed(info)],
            components: [buildPageSelect(cacheKey, 'overview')],
          },
        });
      } catch (err) {
        console.error('Info error:', err);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL,
            content: `Failed to fetch player info: ${err.message}`,
          },
        });
      }
    }

    // ─── /setmoney ───
    if (name === 'setmoney') {
      const userId = getOption(options, 'userid');
      const amount = getOption(options, 'amount');

      try {
        const username = await getPlayerUsername(userId);
        const commandId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        await writePendingCommand(userId, {
          id: commandId,
          command: 'setmoney',
          amount,
          issuedBy: member.user.username,
          issuedAt: Math.floor(Date.now() / 1000),
        });

        await publishMessage({
          command: 'setmoney',
          userId: String(userId),
          amount,
        });

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [{
              title: '💰 V$ Set',
              color: 0x2ecc71,
              fields: [
                { name: 'Player', value: username ? `${username} (\`${userId}\`)` : `\`${userId}\``, inline: true },
                { name: 'Amount', value: `**V$${amount.toLocaleString()}**`, inline: true },
                { name: 'Set By', value: member.user.username, inline: true },
              ],
              footer: { text: 'Applies immediately if online, otherwise on next join' },
              timestamp: new Date().toISOString(),
            }],
          },
        });
      } catch (err) {
        console.error('SetMoney error:', err);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL,
            content: `Failed to set V$: ${err.message}`,
          },
        });
      }
    }

    // ─── /addmoney ───
    if (name === 'addmoney') {
      const userId = getOption(options, 'userid');
      const amount = getOption(options, 'amount');

      try {
        const username = await getPlayerUsername(userId);
        const commandId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        await writePendingCommand(userId, {
          id: commandId,
          command: 'addmoney',
          amount,
          issuedBy: member.user.username,
          issuedAt: Math.floor(Date.now() / 1000),
        });

        await publishMessage({
          command: 'addmoney',
          userId: String(userId),
          amount,
        });

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [{
              title: '💰 V$ Added',
              color: 0x2ecc71,
              fields: [
                { name: 'Player', value: username ? `${username} (\`${userId}\`)` : `\`${userId}\``, inline: true },
                { name: 'Amount', value: `**+V$${amount.toLocaleString()}**`, inline: true },
                { name: 'Added By', value: member.user.username, inline: true },
              ],
              footer: { text: 'Applies immediately if online, otherwise on next join' },
              timestamp: new Date().toISOString(),
            }],
          },
        });
      } catch (err) {
        console.error('AddMoney error:', err);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL,
            content: `Failed to add V$: ${err.message}`,
          },
        });
      }
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  // ─── Component interactions (page switching) ───
  if (type === InteractionType.MESSAGE_COMPONENT) {
    const componentId = data.custom_id;

    if (componentId.startsWith('info_page_')) {
      const cacheKey = componentId.replace('info_page_', '');
      const selectedPage = data.values[0];
      const info = cacheGet(cacheKey);

      if (!info) {
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            content: 'This info lookup has expired. Please run `/info` again.',
            embeds: [],
            components: [],
          },
        });
      }

      const embed = selectedPage === 'stats'
        ? buildStatsEmbed(info)
        : buildOverviewEmbed(info);

      return res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: {
          embeds: [embed],
          components: [buildPageSelect(cacheKey, selectedPage)],
        },
      });
    }

    return;
  }

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
