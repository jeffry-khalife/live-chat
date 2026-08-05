export function getDefaultChannel(server) {
    return server.channels.find((channel) => channel.type === 'text') ?? server.channels[0] ?? null;
}

export function mergeChannels(existingChannels = [], incomingChannel) {
    const nextChannels = Array.isArray(incomingChannel) ? incomingChannel : [incomingChannel];
    const merged = [];
    const seenIds = new Set();

    for (const channel of [...existingChannels, ...nextChannels]) {
        if (!channel || seenIds.has(channel.id)) {
            continue;
        }

        seenIds.add(channel.id);
        merged.push(channel);
    }

    return merged;
}

export function removeChannel(existingChannels = [], channelId) {
    return existingChannels.filter((channel) => Number(channel.id) !== Number(channelId));
}