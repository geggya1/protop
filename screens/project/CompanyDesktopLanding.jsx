import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { isSuperAdmin, updateGroup } from '../../src/utils/groups';
import { companyAddressParts } from '../../src/mileage/flow';
import {
  fetchPublicCompany,
  storedCompanyProfile,
} from '../../src/project/companyPublic';
import { normalizeCompanyPage } from '../../src/project/companyPage';
import CompanyPublicProfile from '../../components/project/CompanyPublicProfile';

/**
 * Offentlig bedriftsprofil. Registerdetaljer ligger under Om oss.
 * Innstillinger åpnes fra Rediger side og fra menyen.
 */
export default function CompanyDesktopLanding({
  stored,
  onSettings,
  onUnits,
  onEmployees,
  onProjects,
}) {
  const colors = useColors();
  const { familyId, family, uid, applyFamilyPatch } = useApp();
  const access = useCompanyAccess();
  const owner = isSuperAdmin(family, uid);
  const canEdit = (owner && !access.previewLocks('companyProfile'))
    || (access.ready && access.can('companyProfile', 'write'));
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const profile = live?.company || storedCompanyProfile(stored);
  const travel = companyAddressParts(stored?.kjoeradresse?.gate ? stored : {
    forretning: profile?.forretning,
    addressLabel: stored?.addressLabel || profile?.forretning?.label,
  });
  const address = travel?.label || profile?.forretning?.label || '';
  const orgnr = stored?.organisasjonsnummer || '';

  useEffect(() => {
    if (String(orgnr).replace(/\D/g, '').length !== 9) return undefined;
    let alive = true;
    setLoading(true);
    setError('');
    fetchPublicCompany(orgnr)
      .then((data) => {
        if (!alive) return;
        if (!data.ok) {
          setError(data.error || 'Kunne ikke hente offentlige opplysninger.');
          return;
        }
        setLive(data);
      })
      .catch((err) => {
        if (alive) setError(err?.message || 'Kunne ikke hente offentlige opplysninger.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [orgnr]);

  async function savePage(nextPage) {
    if (!familyId) throw new Error('Mangler selskap.');
    const company = { ...stored, publicPage: normalizeCompanyPage(nextPage) };
    await updateGroup(familyId, { company });
    applyFamilyPatch?.(familyId, { company });
  }

  if (!profile?.navn && !stored?.navn) {
    return <Text style={{ color: colors.muted }}>Bedriftsprofilen er ikke klar.</Text>;
  }

  return (
    <View nativeID="company-public-profile" id="company-public-profile">
      <CompanyPublicProfile
        stored={stored}
        profile={profile}
        live={live}
        loading={loading}
        error={error}
        address={address}
        canEdit={canEdit}
        familyId={familyId}
        onSettings={onSettings}
        onUnits={onUnits}
        onEmployees={onEmployees}
        onProjects={onProjects}
        onSavePage={savePage}
      />
    </View>
  );
}
