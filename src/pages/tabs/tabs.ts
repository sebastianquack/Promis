import { Component } from '@angular/core';
import { ListPage } from '../list/list';
import { MapPage } from '../map/map';
import { NewPage } from '../new/new';

@Component({
  templateUrl: 'tabs.html'
})
export class TabsPage {
  // this tells the tabs component which Pages
  // should be each tab's root Page
  tab1Root: any = ListPage;
  tab2Root: any = MapPage;
  tab3Root: any = NewPage;

  constructor() {

  }
}
