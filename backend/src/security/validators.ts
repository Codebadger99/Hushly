export const MAX_ROOM_NAME_LENGTH = 50;
export const MAX_MESSAGE_LENGTH = 1000;

// Each returns an error string, or null if valid

export function validateRoomName(name: unknown): string | null {
  if (typeof name !== 'string' || !name.trim()) return 'Room name is required';
  if (name.trim().length > MAX_ROOM_NAME_LENGTH) {
    return `Room name must be ${MAX_ROOM_NAME_LENGTH} characters or less`;
  }
  return null;
}

export function validateMessage(body: unknown): string | null {
  if (typeof body !== 'string' || !body.trim()) return 'Message cannot be empty';
  if (body.trim().length > MAX_MESSAGE_LENGTH) {
    return `Message must be ${MAX_MESSAGE_LENGTH} characters or less`;
  }
  return null;
}