export type SignupFormValues = {
  // Step 1
  name: string;
  email: string;
  password: string;
  confirmPassword: string;

  // Step 2
  accountType: 'artist' | 'label' | '';

  // Step 3 — Artist
  artistName: string;
  legalName: string;
  idType: 'pan' | 'aadhaar';
  panId: string;
  aadhaarId: string;
  legalAddress: string;
  phoneNumber: string;
  numberOfTracks: number | '';
  numberOfReleases: number | '';
  governmentIdFile: File | null;

  // Step 3 — Label
  labelName: string;
  registrationType: 'individual' | 'registered_company' | '';
  labelLegalName: string;       // for individual
  legalEntityName: string;      // for registered company
  companyType: 'private' | 'public' | '';
  incorporationCertFile: File | null;
  gstCertFile: File | null;
  labelGovIdFile: File | null;  // for individual
  totalArtists: number | '';
  totalRevenue: number | '';
  catalogSize: number | '';
  rightsType: 'exclusive' | 'non_exclusive' | '';
  companyWebsite: string;
  socialLinks: {
    instagram: string;
    twitter: string;
    facebook: string;
    youtube: string;
  };

  // Step 4 - Verification routing
  verificationPhoneNumber: string;
  mobileVerificationProvider: 'surepass' | 'sandbox' | 'manual';
  kycProvider: 'surepass' | 'sandbox' | 'manual';
  kycConsent: boolean;
};

export const defaultSignupValues: SignupFormValues = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  accountType: '',
  artistName: '',
  legalName: '',
  idType: 'pan',
  panId: '',
  aadhaarId: '',
  legalAddress: '',
  phoneNumber: '',
  numberOfTracks: '',
  numberOfReleases: '',
  governmentIdFile: null,
  labelName: '',
  registrationType: '',
  labelLegalName: '',
  legalEntityName: '',
  companyType: '',
  incorporationCertFile: null,
  gstCertFile: null,
  labelGovIdFile: null,
  totalArtists: '',
  totalRevenue: '',
  catalogSize: '',
  rightsType: '',
  companyWebsite: '',
  socialLinks: {
    instagram: '',
    twitter: '',
    facebook: '',
    youtube: '',
  },
  verificationPhoneNumber: '',
  mobileVerificationProvider: 'surepass',
  kycProvider: 'surepass',
  kycConsent: false,
};

export const SIGNUP_STEPS = [
  { label: 'Basic Info' },
  { label: 'Verify OTP' },
];
