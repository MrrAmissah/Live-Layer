export interface PersonProfile {
  id: string;
  displayName: string;
  title?: string;
  churchName?: string;
  subtitle?: string;
  notes?: string;
  headshotAssetId?: string;
  logoAssetId?: string;
  favorite?: boolean;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonProfileInput {
  displayName: string;
  title?: string;
  churchName?: string;
  subtitle?: string;
  notes?: string;
  headshotAssetId?: string;
  logoAssetId?: string;
  favorite?: boolean;
}
