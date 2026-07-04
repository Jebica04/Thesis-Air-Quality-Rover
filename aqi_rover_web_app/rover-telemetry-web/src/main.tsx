import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Amplify } from 'aws-amplify';
import { signInWithRedirect } from 'aws-amplify/auth';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)


Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'eu-north-1_rlgztc',                 // Your active User Pool ID
      userPoolClientId: '5jsehsah7e0ldpri508rhv7gqe',  // Your brand new SPA Client ID (No Secret)
      loginWith: {
        oauth: {
          domain: 'eu-north-1rf2oom2nc.auth.eu-north-1.amazoncognito.com', 
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: ['http://localhost:5173/'],
          redirectSignOut: ['http://localhost:5173/'],
          responseType: 'code'
        }
      }
    }
  }
});


const handleGoogleSignIn = async () => {
     try {
       await signInWithRedirect({ provider: 'Google' });
     } catch (error) {
       console.error("Mission Control Auth Failed: ", error);
     }
   };