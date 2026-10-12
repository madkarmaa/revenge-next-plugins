import Page from '@revenge-mod/components/Page';
import TableRowAssetIcon from '@revenge-mod/components/TableRowAssetIcon';
import { Design } from '@revenge-mod/discord/design';
import type { PluginSettingsComponent } from '@revenge-mod/plugins/types';
import type { ComponentProps } from 'react';
import type { Settings } from '.';

const { TableRowGroup, TableSwitchRow } = Design;

type SettingsComponentProps = ComponentProps<
    PluginSettingsComponent<{ jsonStorage: Settings }>
>;

export default function SettingsComponent({
    api: { jsonStorage: storage }
}: SettingsComponentProps) {
    const { redirect, referrals } = storage.use() ?? {};

    return (
        <Page>
            <TableRowGroup title="Settings">
                <TableSwitchRow
                    icon={<TableRowAssetIcon name="MagnifyingGlassIcon" />}
                    label="Remove link wrapping"
                    subLabel={
                        redirect
                            ? 'https://example.com/'
                            : 'https://www.google.com/url?q=https://example.com/'
                    }
                    value={redirect ?? true}
                    onValueChange={(redirect) => storage.set({ redirect })}
                />
                <TableSwitchRow
                    icon={<TableRowAssetIcon name="QuestsIcon" />}
                    label="Remove referral parameters"
                    subLabel={`https://amazon.com/product${referrals ? '/' : '?tag=nexpid-50'}`}
                    value={referrals ?? false}
                    onValueChange={(referrals) => storage.set({ referrals })}
                />
            </TableRowGroup>
        </Page>
    );
}
