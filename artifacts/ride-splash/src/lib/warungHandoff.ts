export interface WarungHandoff {
  ownerName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

let pending: WarungHandoff | null = null;

export function setWarungHandoff(data: WarungHandoff) {
  pending = data;
}

export function takeWarungHandoff(): WarungHandoff | null {
  const data = pending;
  pending = null;
  return data;
}
