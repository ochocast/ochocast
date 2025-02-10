import React, {useEffect} from 'react';
import {useAuth} from "react-oidc-context";
import LoadingPage from "../pages/Loading/Loading";
import {api, loginUser} from "./api";

interface ProtectedRoutesProps {
    children: React.ReactNode;
}
export function ProtectedRoutes(props: ProtectedRoutesProps) {
    const auth = useAuth();

    useEffect(() => {
        if(auth.isLoading) {
            return;
        }
        if (auth.user && !auth.user.expired) {
            // Utilisation du token pour configurer les headers de l'API
            api.setHeaders({Authorization: `Bearer ${auth.user.access_token}`});

            // Récupération des informations utilisateur via le backend
            const fetchBackendUser = async () => {
                try {
                    const res = await loginUser();
                    //console.log('Backend user:', res.data);
                    localStorage.setItem('backendUser', JSON.stringify(res.data));
                } catch (error) {
                    console.error(`Failed to fetch user: ${error}`);
                }
            };

            fetchBackendUser();
        } else {
            if (auth.user && auth.user.expired) {
                // Renouveler le token si expiré
                auth.signinSilent().then(user => {
                    if (!user) {
                        // Rediriger l'utilisateur vers la connexion si non authentifié
                        auth.signinRedirect();
                    }
                });
            } else {
                // Rediriger l'utilisateur vers la connexion si non authentifié
                auth.signinRedirect();
            }
        }
    }, [auth]);

    if(auth.isAuthenticated) {
        return <>{props.children}</>;
    }

    return <LoadingPage />;
}
