import BaseViewModel from 'components/base-view-model';
import ko from 'knockout';
import { sessionInfo, systemInfo } from 'model';
import { stringifyAmount } from 'utils/string-utils';
import { openDeleteCurrentAccountWarningModal } from 'dispatchers';
import { deleteAccount } from 'actions';

export default class AccountRowViewModel extends BaseViewModel {
    constructor(account, deleteGroup) {
        super();

        let systemName = ko.pureComputed(
            () => systemInfo() ? systemInfo().name : ''
        );

        this.email = ko.pureComputed(
            () => account() ? account().email : ''
        );

        this.name = ko.pureComputed(
            () => {
                if (!account()) {
                    return '';
                }

                const email = this.email();
                const curr = sessionInfo() && sessionInfo().user;
                const text = `${email} ${email === curr ? '(Current user)' : ''}`;
                const href = {
                    route: 'account',
                    params: { account: email, tab: null }
                };

                return { text, href };
            }
        );

        this.connections = ko.pureComputed(
            () => {
                if (!account()) {
                    return '';
                }

                const count = account().external_connections.count;
                return count > 0 ?
                    stringifyAmount('connection', count) :
                    'no connections';
            }
        );


        this.isSystemOwner = ko.pureComputed(
            () => systemInfo() && this.email() === systemInfo().owner.email
        );

        this.role = ko.pureComputed(
            () => {
                if (!account() || !systemName()) {
                    return '';
                }

                return  this.isSystemOwner() ? 'owner' : account().systems.find(
                    ({ name }) => name === systemName()
                ).roles[0];
            }
        );

        this.s3Access = ko.pureComputed(
            () => account() ?
                (account().has_s3_access ? 'enabled' : 'disabled') :
                ''
        );

        this.deleteButton = {
            subject: 'account',
            group: deleteGroup,
            undeletable: this.isSystemOwner,
            tooltip: ko.pureComputed(() => this.deleteTooltip()),
            onDelete: () => this.onDelete()
        };
    }

    deleteTooltip() {
        return this.isSystemOwner() ?
            'Cannot delete system owner' :
            'Delete account';
    }

    onDelete() {
        const email = this.email();
        if (email === sessionInfo().user) {
            openDeleteCurrentAccountWarningModal();
        } else {
            deleteAccount(email);
        }
    }
}
