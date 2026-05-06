import './HomePage.css';
import { HomePageLayout } from './HomePage/HomePageLayout.js';
import { useHomePageController } from './HomePage/useHomePageController.js';

export default function HomePage() {
  const controller = useHomePageController();
  return <HomePageLayout controller={controller} />;
}
