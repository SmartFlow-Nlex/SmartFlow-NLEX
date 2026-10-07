import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { ActiveCommunityTab } from '@smartflow/shared';
import SegmentedControl from '../ui/SegmentedControl';

export interface FilterTabsProps {
  activeTab: ActiveCommunityTab;
  onTabChange: (tab: ActiveCommunityTab) => void;
}

/** One entry per tab, so the id, label and icon are each written once. */
const tabs: {
  id: ActiveCommunityTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'community', label: 'Community Updates', icon: 'people-outline' },
  { id: 'incidents', label: 'Recent Incidents', icon: 'warning-outline' },
];

/** The feed's two lists, on the same segmented switch every other tab uses. */
const FilterTabs: React.FC<FilterTabsProps> = ({ activeTab, onTabChange }) => (
  <SegmentedControl
    accessibilityLabel="Community feed"
    // White for the chosen list, as in Community's mockup.
    tone="white"
    items={tabs.map((tab) => ({ key: tab.id, label: tab.label, icon: tab.icon }))}
    value={activeTab}
    onChange={onTabChange}
    style={styles.switcher}
  />
);

export default FilterTabs;

const styles = StyleSheet.create({
  switcher: {
    marginBottom: 12,
  },
});
