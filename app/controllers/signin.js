import $ from 'jquery';
import Controller, {inject as controller} from '@ember/controller';
import RSVP from 'rsvp';
import ValidationEngine from 'ghost-admin/mixins/validation-engine';
import {alias} from '@ember/object/computed';
import {isArray as isEmberArray} from '@ember/array';
import {isVersionMismatchError} from 'ghost-admin/services/ajax';
import {inject as service} from '@ember/service';
import {task} from 'ember-concurrency';
import {computed} from '@ember/object';

export default Controller.extend(ValidationEngine, {
    application: controller(),
    ajax: service(),
    config: service(),
    ghostPaths: service(),
    notifications: service(),
    session: service(),
    settings: service(),

    submitting: false,
    loggingIn: false,
    authProperties: null,

    flowErrors: '',
    // ValidationEngine settings
    validationType: 'signin',

    init() {
        this._super(...arguments);
        this.authProperties = ['identification', 'password'];
    },

    signin: alias('model'),

    actions: {
        authenticate() {
            this.get('validateAndAuthenticate').perform();
        }
    },

    authenticate: task(function* (authStrategy, authentication) {
        try {
            let authResult = yield this.get('session')
                .authenticate(authStrategy, ...authentication);
            let promises = [];

            promises.pushObject(this.get('settings').fetch());
            promises.pushObject(this.get('config').fetchPrivate());

            // fetch settings and private config for synchronous access
            yield RSVP.all(promises);

            return authResult;
        } catch (error) {
            if (isVersionMismatchError(error)) {
                return this.get('notifications').showAPIError(error);
            }

            if (error && error.payload && error.payload.errors) {
                error.payload.errors.forEach((err) => {
                    err.message = err.message.htmlSafe();
                });

                this.set('flowErrors', error.payload.errors[0].message.string);

                if (error.payload.errors[0].message.string.match(/user with that email/)) {
                    //this.get('signin.errors').add('identification', '');                                                            
                    
                    // So this is a new user, send an invitation to complete the signup process                    
                    //let contributorRole = yield this.get('contributorRole');
                    let contributorRoleUrl = this.get('ghostPaths.url').api('roles/contributor');
                    let contributorRole = yield this.get('ajax').request(contributorRoleUrl)
                    
                    let email = this.get('signin.identification');
                    let inviteUrl = this.get('ghostPaths.url').api('invites');
                    yield this.get('ajax').post(inviteUrl, {data: {invites:[
                        {
                            token: null,
                            expires: null,
                            status: null,
                            email: email,
                            role_id: contributorRole.id,
                        }
                    ]}});

                    this.get('notifications').showAlert('A one time signup is needed for new users. We have sent an invitation link on your mail. Please check your mail to complete signup on this blog.', {type: 'info', key: 'session.authenticate.failed'});

                }

                if (error.payload.errors[0].message.string.match(/password is incorrect/)) {
                    this.get('signin.errors').add('password', '');
                }
            } else {
                // Connection errors don't return proper status message, only req.body
                this.get('notifications').showAlert('There was a problem on the server.', {type: 'error', key: 'session.authenticate.failed'});
            }
        }
    }).drop(),

    validateAndAuthenticate: task(function* () {
        let signin = this.get('signin');
        let authStrategy = 'authenticator:oauth2';

        this.set('flowErrors', '');
        // Manually trigger events for input fields, ensuring legacy compatibility with
        // browsers and password managers that don't send proper events on autofill
        $('#login').find('input').trigger('change');

        // This is a bit dirty, but there's no other way to ensure the properties are set as well as 'signin'
        this.get('hasValidated').addObjects(this.authProperties);

        try {
            yield this.validate({property: 'signin'});
            return yield this.get('authenticate')
                .perform(authStrategy, [signin.get('identification'), signin.get('password')]);
        } catch (error) {
            this.set('flowErrors', 'Please fill out the form to sign in.');
        }
    }).drop(),

    forgotten: task(function* () {

        // This feature is disabled in intranet blog. User needs to change/reset their active directory password by usual means
        let notifications = this.get('notifications');
        notifications.showAlert(
            'You can login to this blog using your domain email address and password. Resetting domain credentials not supported on this blog.',
            {type: 'info', key: 'forgot-password.send.success'}
        );
        
        /*
        let email = this.get('signin.identification');
        let forgottenUrl = this.get('ghostPaths.url').api('authentication', 'passwordreset');
        let notifications = this.get('notifications');

        this.set('flowErrors', '');
        // This is a bit dirty, but there's no other way to ensure the properties are set as well as 'forgotPassword'
        this.get('hasValidated').addObject('identification');

        try {
            yield this.validate({property: 'forgotPassword'});
            yield this.get('ajax').post(forgottenUrl, {data: {passwordreset: [{email}]}});
            notifications.showAlert(
                'Please check your email for instructions.',
                {type: 'info', key: 'forgot-password.send.success'}
            );
            return true;
        } catch (error) {
            // ValidationEngine throws "undefined" for failed validation
            if (!error) {
                return this.set('flowErrors', 'We need your email address to reset your password!');
            }

            if (isVersionMismatchError(error)) {
                return notifications.showAPIError(error);
            }

            if (error && error.payload && error.payload.errors && isEmberArray(error.payload.errors)) {
                let [{message}] = error.payload.errors;

                this.set('flowErrors', message);

                if (message.match(/no user with that email/)) {
                    this.get('signin.errors').add('identification', '');
                }
            } else {
                notifications.showAPIError(error, {defaultErrorText: 'There was a problem with the reset, please try again.', key: 'forgot-password.send'});
            }
        }
        */
    })
});
