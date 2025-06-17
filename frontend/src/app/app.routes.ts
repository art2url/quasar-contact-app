import {Routes} from '@angular/router';

import {LoginComponent} from '@features/auth/login/login.component';
import {RegisterComponent} from '@features/auth/register/register.component';
import {ForgotPasswordComponent} from '@features/auth/forgot-password/forgot-password.component';
import {ResetPasswordComponent} from '@features/auth/reset-password/reset-password.component';
import {ChatListComponent} from '@features/chat/chat-list/chat-list.component';
import {ChatRoomComponent} from '@features/chat/chat-room/chat-room.component';
import {SettingsComponent} from '@features/settings/settings.component';
import {AuthGuard} from '@core/auth/guards/auth.guard';

export const routes: Routes = [
  /* App root redirect */
  {path: '', redirectTo: '/chat', pathMatch: 'full'},

  /* Auth routes */
  {path: 'auth/login', component: LoginComponent},
  {path: 'auth/register', component: RegisterComponent},
  {path: 'auth/forgot-password', component: ForgotPasswordComponent},
  {path: 'auth/reset-password', component: ResetPasswordComponent},

  /* Protected App routes */
  {path: 'chat', component: ChatListComponent, canActivate: [AuthGuard]},
  {
    path: 'chat-room/:id',
    component: ChatRoomComponent,
    canActivate: [AuthGuard],
  },
  {path: 'settings', component: SettingsComponent, canActivate: [AuthGuard]},

  /* Fallback - redirect unauthenticated users to login */
  {path: '**', redirectTo: '/auth/login'},
];
