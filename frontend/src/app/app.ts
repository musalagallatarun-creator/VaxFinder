
import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { timeout, finalize } from 'rxjs';
import * as L from 'leaflet';

interface VaccinationCentre {
  id: number;
  name: string;
  city: string;
  pincode: string | number;
  vaccine: string;
  available_slots: number;
  available_doses: number;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
}

interface PostalOffice {
  office_name: string;
  pincode: string | number;
  delivery_status: string;
  office_type: string;
  [key: string]: any;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, AfterViewInit, OnDestroy {
  private readonly apiUrl = 'http://localhost:3000/api';

  @ViewChild('centreMap')
  private centreMapElement?: ElementRef<HTMLDivElement>;

  centres: VaccinationCentre[] = [];

  searchText = '';
  selectedVaccine = '';
  sortByDoses = false;

  loading = true;
  errorMessage = '';

  centreCitySearch = '';
  centrePincodeSearch = '';
  centreSearchLoading = false;
  centreSearchError = '';
  centreSearchDone = false;
  centreSearchResults: VaccinationCentre[] = [];

  pincodeSearch = '';
  pincodeLoading = false;
  pincodeError = '';
  pincodeSearched = false;
  postalOffices: PostalOffice[] = [];

  centresLoading = false;
  centresError = '';
  centresSearched = false;
  matchingCentres: VaccinationCentre[] = [];

  private map?: L.Map;
  private mapMarkers?: L.LayerGroup;
  private viewReady = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadCentres();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.initializeMap();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  get totalSlots(): number {
    return this.centres.reduce(
      (total, centre) => total + Number(centre.available_slots || 0),
      0
    );
  }

  get totalDoses(): number {
    return this.centres.reduce(
      (total, centre) => total + Number(centre.available_doses || 0),
      0
    );
  }

  get filteredCentres(): VaccinationCentre[] {
    const query = this.searchText.trim().toLowerCase();

    let results = this.centres.filter((centre) => {
      const matchesSearch =
        !query ||
        String(centre.city || '').toLowerCase().includes(query) ||
        String(centre.pincode || '').includes(query) ||
        String(centre.name || '').toLowerCase().includes(query) ||
        String(centre.vaccine || '').toLowerCase().includes(query);

      const matchesVaccine =
        !this.selectedVaccine ||
        String(centre.vaccine || '').toLowerCase() ===
          this.selectedVaccine.toLowerCase();

      return matchesSearch && matchesVaccine;
    });

    if (this.sortByDoses) {
      results = [...results].sort(
        (a, b) =>
          Number(b.available_doses || 0) -
          Number(a.available_doses || 0)
      );
    }

    return results;
  }

  loadCentres(): void {
    this.loading = true;
    this.errorMessage = '';

    this.http
      .get<VaccinationCentre[]>(`${this.apiUrl}/centres`)
      .pipe(
        timeout(10000),
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({
        next: (data) => {
          this.centres = Array.isArray(data) ? data : [];
          this.updateMap();
        },
        error: (error) => {
          console.error('Loading centres failed:', error);
          this.errorMessage =
            'Unable to load centres. Check that your backend and database are running.';
        }
      });
  }

  onFiltersChanged(): void {
    this.updateMap();
  }

  clearFilters(): void {
    this.searchText = '';
    this.selectedVaccine = '';
    this.sortByDoses = false;
    this.updateMap();
  }

  searchCentres(): void {
    const city = this.centreCitySearch.trim();
    const pincode = this.centrePincodeSearch.trim();

    if (!city && !pincode) {
      this.centreSearchError =
        'Please enter a city or a PIN code.';
      this.centreSearchDone = false;
      this.centreSearchResults = [];
      return;
    }

    if (pincode && !/^\d{6}$/.test(pincode)) {
      this.centreSearchError =
        'Please enter a valid 6-digit PIN code.';
      this.centreSearchDone = false;
      this.centreSearchResults = [];
      return;
    }

    let params = new HttpParams();

    if (city) {
      params = params.set('city', city);
    }

    if (pincode) {
      params = params.set('pincode', pincode);
    }

    this.centreSearchLoading = true;
    this.centreSearchError = '';
    this.centreSearchDone = false;

    this.http
      .get<VaccinationCentre[]>(`${this.apiUrl}/centres`, { params })
      .pipe(
        timeout(10000),
        finalize(() => {
          this.centreSearchLoading = false;
          this.centreSearchDone = true;
        })
      )
      .subscribe({
        next: (data) => {
          this.centreSearchResults = Array.isArray(data) ? data : [];

          if (this.centreSearchResults.length === 0) {
            this.centreSearchError =
              'No matching centres found. Try another city or PIN code.';
          }
        },
        error: (error) => {
          console.error('Centre search failed:', error);
          this.centreSearchResults = [];
          this.centreSearchError =
            'Could not search centres. Check that your backend is running.';
        }
      });
  }

  searchPincodes(): void {
    const pincode = this.pincodeSearch.trim();

    if (!/^\d{6}$/.test(pincode)) {
      this.pincodeError = 'Enter a valid 6-digit PIN code.';
      this.pincodeSearched = false;
      this.centresSearched = false;
      this.postalOffices = [];
      this.matchingCentres = [];
      return;
    }

    this.pincodeLoading = true;
    this.centresLoading = true;
    this.pincodeError = '';
    this.centresError = '';
    this.pincodeSearched = false;
    this.centresSearched = false;
    this.postalOffices = [];
    this.matchingCentres = [];

    this.http
      .get<PostalOffice[]>(`${this.apiUrl}/pincodes`, {
        params: { pincode }
      })
      .pipe(
        timeout(10000),
        finalize(() => {
          this.pincodeLoading = false;
          this.pincodeSearched = true;
        })
      )
      .subscribe({
        next: (data) => {
          this.postalOffices = Array.isArray(data) ? data : [];
        },
        error: (error) => {
          console.error('Postal PIN search failed:', error);
          this.postalOffices = [];
          this.pincodeError =
            'Could not load postal offices. Check your backend API.';
        }
      });

    this.http
      .get<VaccinationCentre[]>(`${this.apiUrl}/centres`, {
        params: { pincode }
      })
      .pipe(
        timeout(10000),
        finalize(() => {
          this.centresLoading = false;
          this.centresSearched = true;
        })
      )
      .subscribe({
        next: (data) => {
          this.matchingCentres = Array.isArray(data) ? data : [];
        },
        error: (error) => {
          console.error('PIN code centre search failed:', error);
          this.matchingCentres = [];
          this.centresError =
            'Could not load centre records. Check your backend API.';
        }
      });
  }

  clearPincodeSearch(): void {
    this.pincodeSearch = '';
    this.pincodeError = '';
    this.pincodeSearched = false;
    this.postalOffices = [];

    this.centresLoading = false;
    this.centresError = '';
    this.centresSearched = false;
    this.matchingCentres = [];
  }

  private initializeMap(): void {
    const element = this.centreMapElement?.nativeElement;

    if (!element || this.map) {
      return;
    }

    this.map = L.map(element).setView([17.385, 78.4867], 7);

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }
    ).addTo(this.map);

    this.mapMarkers = L.layerGroup().addTo(this.map);
    this.updateMap();
  }

  private updateMap(): void {
    if (!this.viewReady) {
      return;
    }

    if (!this.map) {
      this.initializeMap();
      return;
    }

    if (!this.mapMarkers) {
      return;
    }

    this.mapMarkers.clearLayers();

    const locatedCentres = this.filteredCentres.filter((centre) => {
      const lat = Number(centre.latitude);
      const lng = Number(centre.longitude);

      return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180 &&
        (lat !== 0 || lng !== 0)
      );
    });

    locatedCentres.forEach((centre) => {
      const marker = L.marker([
        Number(centre.latitude),
        Number(centre.longitude)
      ]);

      const popup = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = centre.name || 'Vaccination centre';

      const city = document.createElement('div');
      city.textContent = centre.city || '';

      const vaccine = document.createElement('div');
      vaccine.textContent = `Vaccine: ${centre.vaccine || 'Not specified'}`;

      const doses = document.createElement('div');
      doses.textContent =
        `Listed doses: ${Number(centre.available_doses || 0)}`;

      popup.append(title, city, vaccine, doses);
      marker.bindPopup(popup);
      marker.addTo(this.mapMarkers!);
    });

    if (locatedCentres.length > 0) {
      const bounds = L.latLngBounds(
        locatedCentres.map(
          (centre) =>
            [
              Number(centre.latitude),
              Number(centre.longitude)
            ] as L.LatLngTuple
        )
      );

      this.map.fitBounds(bounds, {
        padding: [25, 25],
        maxZoom: 12
      });
    }
  }
}
