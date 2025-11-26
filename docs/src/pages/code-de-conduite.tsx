import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './code-de-conduite.module.css';
import footerStyles from './index.module.css';

function Footer() {
  return (
    <footer className={footerStyles.footer}>
      <div className={footerStyles.footerContainer}>
        <div className={footerStyles.footerColumn}>
          <h3 className={footerStyles.footerTitle}>OchoCast</h3>
          <p className={footerStyles.footerDescription}>
            La solution libre pour capturer et diffuser vos savoirs. Un projet open source développé avec passion par des élèves.
          </p>
          <h4 className={footerStyles.footerSubtitle}>Contribuer</h4>
          <a href="https://github.com/ochocast/ochocast-webapp" className={footerStyles.footerLink}>
            <svg className={footerStyles.githubIcon} viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            Voir sur GitHub
          </a>
        </div>
        <div className={footerStyles.footerColumn}>
          <h3 className={footerStyles.footerTitle}>Liens rapides</h3>
          <ul className={footerStyles.footerList}>
            <li><Link to="/" className={footerStyles.footerLink}>Accueil</Link></li>
            <li><Link to="/code-de-conduite" className={footerStyles.footerLink}>Code de conduite</Link></li>
            <li><Link to="/origine-du-projet" className={footerStyles.footerLink}>Histoire du projet</Link></li>
            <li><Link to="/equipes" className={footerStyles.footerLink}>Équipe</Link></li>
            <li><Link to="/remerciements" className={footerStyles.footerLink}>Remerciements</Link></li>
          </ul>
        </div>
        <div className={footerStyles.footerColumn}>
          <h3 className={footerStyles.footerTitle}>Ressources</h3>
          <ul className={footerStyles.footerList}>
            <li><Link to="/docs/documentation/utilisation/introduction" className={footerStyles.footerLink}>Documentation</Link></li>
            <li><Link to="/versions" className={footerStyles.footerLink}>Versions</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export default function CodeDeConduite(): JSX.Element {
  return (
    <Layout
      title="Code de conduite"
      description="Code de conduite du projet OchoCast">
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.content}>
            <h1 className={styles.title}>Code de conduite</h1>
          
          <p className={styles.intro}>
            Le projet OchoCast s'engage à offrir un environnement accueillant et respectueux pour tous les 
            contributeurs, utilisateurs et membres de la communauté.
          </p>

          <section className={styles.section} id="nos-engagements">
            <h2 className={styles.sectionTitle}>Nos engagements</h2>
            <p className={styles.text}>
              Dans l'intérêt de favoriser un environnement ouvert et accueillant, nous nous engageons à faire de 
              la participation à notre projet et à notre communauté une expérience exempte de harcèlement 
              pour tous, indépendamment de l'âge, de la taille corporelle, du handicap, de l'ethnicité, de l'identité 
              et de l'expression de genre, du niveau d'expérience, de la nationalité, de l'apparence personnelle, 
              de la race, de la religion ou de l'identité et de l'orientation sexuelles.
            </p>
          </section>

          <section className={styles.section} id="nos-standards">
            <h2 className={styles.sectionTitle}>Nos standards</h2>
            <p className={styles.text}>
              Les comportements qui contribuent à créer un environnement positif incluent :
            </p>
            <ul className={styles.list}>
              <li>Utiliser un langage accueillant et inclusif</li>
              <li>Respecter les différents points de vue et expériences</li>
              <li>Accepter gracieusement les critiques constructives</li>
              <li>Se concentrer sur ce qui est le mieux pour la communauté</li>
              <li>Faire preuve d'empathie envers les autres membres de la communauté</li>
            </ul>
          </section>

          <section className={styles.section} id="comportements-inacceptables">
            <h2 className={styles.sectionTitle}>Comportements inacceptables</h2>
            <p className={styles.text}>
              Les exemples de comportements inacceptables incluent :
            </p>
            <ul className={styles.list}>
              <li>L'utilisation de langage ou d'images sexualisés et les avances sexuelles non sollicitées</li>
              <li>Le trolling, les commentaires insultants ou dérogatoires, et les attaques personnelles ou politiques</li>
              <li>Le harcèlement public ou privé</li>
              <li>La publication d'informations privées d'autres personnes sans permission explicite</li>
              <li>Toute autre conduite qui pourrait raisonnablement être considérée comme inappropriée dans un cadre professionnel</li>
            </ul>
          </section>

          <section className={styles.section} id="nos-responsabilites">
            <h2 className={styles.sectionTitle}>Nos responsabilités</h2>
            <p className={styles.text}>
              Les mainteneurs du projet sont responsables de clarifier les standards de comportement 
              acceptable et sont censés prendre des mesures correctives appropriées et équitables en réponse 
              à tout comportement inacceptable.
            </p>
          </section>

          <section className={styles.section} id="application">
            <h2 className={styles.sectionTitle}>Application</h2>
            <p className={styles.text}>
              Les cas de comportement abusif, harcelant ou autrement inacceptable peuvent être signalés en 
              contactant l'équipe du projet. Toutes les plaintes seront examinées et feront l'objet d'une enquête, 
              et donneront lieu à une réponse jugée nécessaire et appropriée aux circonstances.
            </p>
          </section>
          </div>
          
          <aside className={styles.toc}>
            <h3 className={styles.tocTitle}>Sur cette page</h3>
            <ul className={styles.tocList}>
              <li><a href="#nos-engagements">Nos engagements</a></li>
              <li><a href="#nos-standards">Nos standards</a></li>
              <li><a href="#comportements-inacceptables">Comportements inacceptables</a></li>
              <li><a href="#nos-responsabilites">Nos responsabilités</a></li>
              <li><a href="#application">Application</a></li>
            </ul>
          </aside>
        </div>
      </main>
      <Footer />
    </Layout>
  );
}
