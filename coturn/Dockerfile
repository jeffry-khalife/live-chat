FROM coturn/coturn:4.6

EXPOSE 3478

ENTRYPOINT []
CMD sh -c "turnserver -n --log-file=stdout --listening-port=3478 \
    --min-port=49160 --max-port=49200 \
    --realm=livechat.local \
    --lt-cred-mech --no-cli --fingerprint \
    --user=\${TURN_USERNAME}:\${TURN_CREDENTIAL}"
