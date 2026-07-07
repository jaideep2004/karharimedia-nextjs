import type { DspKey } from '@/lib/platforms';

export const YOUTUBE_CONTENT_ID_TERMS_URL = '/terms/youtube-content-id';
export const FACEBOOK_RIGHTS_MANAGER_TERMS_URL = '/terms/facebook-rights-manager';

export const YOUTUBE_POLICY_DSP_KEYS = new Set<DspKey>(['youtube', 'youtube-delivery']);
export const FACEBOOK_RIGHTS_POLICY_DSP_KEYS = new Set<DspKey>([
  'facebook-rights-management',
]);

export type ReleasePolicyAcceptances = {
  youtubeContentId: {
    accepted: boolean;
    policyUrl: string;
    policyVersion: string;
  };
  facebookRightsManager: {
    accepted: boolean;
    policyUrl: string;
    policyVersion: string;
  };
  summaryDeclaration: {
    accepted: boolean;
    policyVersion: string;
  };
  acceptedAt?: Date | string;
  acceptedBy?: {
    userId: string;
    email?: string;
    name?: string;
  };
};

export const requiresYoutubePolicy = (stores: unknown) =>
  Array.isArray(stores) &&
  stores.some(store => YOUTUBE_POLICY_DSP_KEYS.has(String(store) as DspKey));

export const requiresFacebookRightsPolicy = (stores: unknown) =>
  Array.isArray(stores) &&
  stores.some(store => FACEBOOK_RIGHTS_POLICY_DSP_KEYS.has(String(store) as DspKey));

export function validateReleasePolicyAcceptances(
  stores: unknown,
  acceptances: Partial<ReleasePolicyAcceptances> | undefined
) {
  if (requiresYoutubePolicy(stores) && !acceptances?.youtubeContentId?.accepted) {
    throw new Error('YouTube Content ID policy acceptance is required');
  }
  if (
    requiresFacebookRightsPolicy(stores) &&
    !acceptances?.facebookRightsManager?.accepted
  ) {
    throw new Error('Facebook Rights Manager policy acceptance is required');
  }
  if (!acceptances?.summaryDeclaration?.accepted) {
    throw new Error('Final release declaration is required');
  }
}

export function buildReleasePolicyProof(
  stores: unknown,
  acceptances: Partial<ReleasePolicyAcceptances> | undefined,
  actor: { _id: string; email?: string; name?: string }
): ReleasePolicyAcceptances {
  validateReleasePolicyAcceptances(stores, acceptances);

  return {
    youtubeContentId: {
      accepted: Boolean(acceptances?.youtubeContentId?.accepted),
      policyUrl: YOUTUBE_CONTENT_ID_TERMS_URL,
      policyVersion: '2026-06-18',
    },
    facebookRightsManager: {
      accepted: Boolean(acceptances?.facebookRightsManager?.accepted),
      policyUrl: FACEBOOK_RIGHTS_MANAGER_TERMS_URL,
      policyVersion: '2026-06-18',
    },
    summaryDeclaration: {
      accepted: true,
      policyVersion: '2026-06-18',
    },
    acceptedAt: new Date(),
    acceptedBy: {
      userId: String(actor._id),
      email: actor.email,
      name: actor.name,
    },
  };
}
