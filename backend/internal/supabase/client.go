package supabase

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	BaseURL    string
	ServiceKey string
	AnonKey    string
	httpClient *http.Client
}

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

func NewClient(baseURL, serviceKey, anonKey string) *Client {
	return &Client{
		BaseURL:    strings.TrimSuffix(baseURL, "/"),
		ServiceKey: serviceKey,
		AnonKey:    anonKey,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *Client) GetUserFromToken(token string) (*User, error) {
	req, err := http.NewRequest("GET", c.BaseURL+"/auth/v1/user", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("apikey", c.AnonKey)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("auth error: %s", resp.Status)
	}
	var user User
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, err
	}
	return &user, nil
}

func (c *Client) Select(table string, query url.Values) ([]byte, error) {
	endpoint := fmt.Sprintf("%s/rest/v1/%s", c.BaseURL, table)
	if len(query) > 0 {
		endpoint = endpoint + "?" + query.Encode()
	}
	return c.do("GET", endpoint, nil, true, false)
}

func (c *Client) Insert(table string, payload any) ([]byte, error) {
	endpoint := fmt.Sprintf("%s/rest/v1/%s", c.BaseURL, table)
	return c.do("POST", endpoint, payload, true, true)
}

func (c *Client) Upsert(table string, payload any) ([]byte, error) {
	endpoint := fmt.Sprintf("%s/rest/v1/%s", c.BaseURL, table)
	return c.do("POST", endpoint, payload, true, true, "resolution=merge-duplicates")
}

func (c *Client) Update(table, filter string, payload any) ([]byte, error) {
	endpoint := fmt.Sprintf("%s/rest/v1/%s?%s", c.BaseURL, table, filter)
	return c.do("PATCH", endpoint, payload, true, true)
}

func (c *Client) Delete(table, filter string) error {
	endpoint := fmt.Sprintf("%s/rest/v1/%s?%s", c.BaseURL, table, filter)
	_, err := c.do("DELETE", endpoint, nil, true, false)
	return err
}

func (c *Client) do(method, endpoint string, payload any, useServiceKey bool, returnRepresentation bool, prefer ...string) ([]byte, error) {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		body = bytes.NewBuffer(encoded)
	}
	req, err := http.NewRequest(method, endpoint, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	key := c.ServiceKey
	if !useServiceKey {
		key = c.AnonKey
	}
	req.Header.Set("apikey", key)
	req.Header.Set("Authorization", "Bearer "+key)
	if returnRepresentation {
		req.Header.Set("Prefer", "return=representation")
	}
	if len(prefer) > 0 {
		req.Header.Set("Prefer", strings.Join(append([]string{"return=representation"}, prefer...), ","))
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("supabase error: %s: %s", resp.Status, string(msg))
	}
	return io.ReadAll(resp.Body)
}
