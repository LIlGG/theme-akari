export function asVoidEventHandler<EventType extends Event>(
  handler: (event: EventType) => Promise<void>,
) {
  return (event: EventType) => {
    void handler(event);
  };
}
