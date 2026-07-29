const presenceRepository = {
    async setUserPresence() {
        return true;
    },
    async getChannelPresence() {
        return [];
    },
};

module.exports = presenceRepository;
